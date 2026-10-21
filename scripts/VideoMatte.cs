using System;
using System.Diagnostics;
using System.IO;

// Stream real video frames through a small-component cleanup of the alpha mask.
// RGB pixels and all larger, potentially detached character parts are preserved.
public static class VideoMatte
{
    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }

    private static Process Start(string exe, string arguments, bool read, bool write)
    {
        var info = new ProcessStartInfo(exe, arguments);
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.RedirectStandardOutput = read;
        info.RedirectStandardInput = write;
        return Process.Start(info);
    }

    private static int Clean(byte[] frame, int width, int height, byte[] seen, int[] queue, int minimumArea)
    {
        Array.Clear(seen, 0, seen.Length);
        int removed = 0;
        // Generators often paint a neutral ground shadow into the green screen.
        // Preserve dark soles/outlines next to opaque colored or light shoe pixels.
        // Color alone cannot distinguish those details from a ground shadow.
        int shoeRadius = Math.Max(6, height / 90);
        for (int y = (int)(height * 0.94); y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int offset = (y * width + x) * 4;
                if (frame[offset + 3] == 0) continue;
                int red = frame[offset], green = frame[offset + 1], blue = frame[offset + 2];
                int lightest = Math.Max(red, Math.Max(green, blue));
                int darkest = Math.Min(red, Math.Min(green, blue));
                if (lightest < 170 && lightest - darkest < 26)
                {
                    bool nearShoe = false;
                    for (int dy = -shoeRadius; dy <= shoeRadius && !nearShoe; dy++)
                    {
                        int ny = y + dy;
                        if (ny < 0 || ny >= height) continue;
                        for (int dx = -shoeRadius; dx <= shoeRadius; dx++)
                        {
                            int nx = x + dx;
                            if (nx < 0 || nx >= width) continue;
                            int other = (ny * width + nx) * 4;
                            if (frame[other + 3] < 200) continue;
                            int hi = Math.Max(frame[other], Math.Max(frame[other + 1], frame[other + 2]));
                            int lo = Math.Min(frame[other], Math.Min(frame[other + 1], frame[other + 2]));
                            if (hi >= 170 || hi - lo >= 26) { nearShoe = true; break; }
                        }
                    }
                    if (nearShoe) continue;
                    frame[offset + 3] = 0;
                    removed++;
                }
            }
        }
        for (int pixel = 0; pixel < seen.Length; pixel++)
        {
            if (seen[pixel] != 0 || frame[pixel * 4 + 3] == 0) continue;
            int head = 0, count = 1;
            queue[0] = pixel;
            seen[pixel] = 1;
            while (head < count)
            {
                int current = queue[head++];
                int x = current % width, y = current / width;
                for (int dy = -1; dy <= 1; dy++)
                {
                    int ny = y + dy;
                    if (ny < 0 || ny >= height) continue;
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        int nx = x + dx;
                        if (nx < 0 || nx >= width) continue;
                        int next = ny * width + nx;
                        if (seen[next] != 0 || frame[next * 4 + 3] == 0) continue;
                        seen[next] = 1;
                        queue[count++] = next;
                    }
                }
            }
            if (count >= minimumArea) continue;
            removed += count;
            for (int i = 0; i < count; i++) frame[queue[i] * 4 + 3] = 0;
        }
        return removed;
    }

    public static string Convert(string ffmpeg, string input, string output, string filter, int minimumArea, int width, int height)
    {
        var frame = new byte[width * height * 4];
        var seen = new byte[width * height];
        var queue = new int[width * height];
        Process decoder = null, encoder = null;
        int frames = 0;
        long removed = 0;
        try
        {
            decoder = Start(ffmpeg, "-hide_banner -loglevel error -i " + Quote(input)
                + " -an -filter_complex " + Quote(filter) + " -map \"[out]\" -vsync 0 -f rawvideo -pix_fmt rgba pipe:1", true, false);
            encoder = Start(ffmpeg, "-hide_banner -loglevel error -y -f rawvideo -pix_fmt rgba -video_size " + width + "x" + height + " -framerate 24 -i pipe:0"
                + " -an -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -deadline good -cpu-used 4 -b:v 0 -crf 20 " + Quote(output), false, true);
            var source = decoder.StandardOutput.BaseStream;
            var destination = encoder.StandardInput.BaseStream;
            while (true)
            {
                int offset = 0;
                while (offset < frame.Length)
                {
                    int read = source.Read(frame, offset, frame.Length - offset);
                    if (read == 0) break;
                    offset += read;
                }
                if (offset == 0) break;
                if (offset != frame.Length) throw new IOException("Incomplete decoded video frame.");
                removed += Clean(frame, width, height, seen, queue, minimumArea);
                destination.Write(frame, 0, frame.Length);
                frames++;
            }
            destination.Close();
            decoder.WaitForExit();
            encoder.WaitForExit();
            if (decoder.ExitCode != 0 || encoder.ExitCode != 0 || frames == 0)
                throw new IOException("Video conversion failed: decoder=" + decoder.ExitCode + ", encoder=" + encoder.ExitCode);
            return "Frames=" + frames + ", isolated alpha pixels removed=" + removed;
        }
        finally
        {
            foreach (var process in new[] { decoder, encoder })
            {
                if (process == null) continue;
                if (!process.HasExited) process.Kill();
                process.Dispose();
            }
        }
    }
}
