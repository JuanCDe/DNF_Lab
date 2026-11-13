# DNF Lab

DNF Lab is a local video annotation and analysis tool for Dynamic No Fins (DNF), the freediving discipline in which athletes swim underwater without fins. It turns manually marked video events into splits, stroke and kick counts, cycle timing, and turn timing for 25 m and 50 m pools.

## Quick start

Install Python 3.10 or later and use a current web browser. The app uses Python's standard library, SQLite, and plain JavaScript. It runs without a package installation or build step.

From the project directory, run:

```sh
python3 server.py --open
```

On Windows, use `py -3 server.py --open` if Python is installed with the Python launcher. On macOS, you can also double-click `Abrir DNF Lab.command`.

The app opens at [http://127.0.0.1:8765](http://127.0.0.1:8765/). Keep the terminal open while you work. Press Ctrl+C to stop the server. Use `--port` to change the port or `--db` to choose another database file.

## Analyze an attempt

1. In **Studio**, open a local video or enter a supported online video URL. Use the timeline and playback controls to find the frames you want to annotate.
2. Mark the start, strokes, kicks, wall contacts, wall releases, and finish. In a 50 m pool, you can also mark the midpoint. Edit any marker from the timeline.
3. Set the pool length and add attempt details as needed. Studio saves changes locally as you work. Use **Save attempt** to save immediately.
4. Review splits and technique timing in Studio. Open **Athletes** for a profile's attempt history, or **Compare** to plot and filter saved attempts across athletes.

Use **Athlete comparison** under the plot to compare two athletes by 25 m segment. The panel uses the current filters and aggregation. Times and cycle counts come from recorded checkpoints and events. A dash indicates a missing measurement.

Studio can export an attempt as CSV and import technique notation copied from Excel.

| Key | Action |
| --- | --- |
| Space | Play or pause |
| Left or right arrow | Seek by the configured interval |
| Shift + left or right arrow | Seek by 0.5 seconds |
| I | Mark the start |
| F or B | Mark the stroke position |
| J or P | Mark the end of the kick |
| M | Mark wall contact or release |
| V | Mark the midpoint in a 50 m pool |
| E | Mark the finish |
| Ctrl+S or Cmd+S | Save |

## Video sources

DNF Lab supports local files, YouTube, and direct MP4, WebM, and HLS links. Playback depends on the browser and the source. For example, a YouTube video must allow embedding. To enable CMAS TV replay links, set `DNF_CMAS_APPLICATION_ID` to a Sportall application ID authorized for CMAS TV before starting the server. Playback is subject to the provider's access controls.

## Local storage and privacy

A fresh installation starts with an empty library. DNF Lab saves profiles, attempts, and their metadata to `data/dnf.sqlite3` by default. Local video files stay in their original locations. A compatible browser may remember access to a previously selected video.

The server listens on `127.0.0.1` for use on your computer. Local video analysis works offline. Online playback contacts the selected provider. If you use profile photo search, the search sends the entered name to Brave. Set `DNF_BRAVE_API_KEY` to use the Brave Search API, or have `curl` installed to use the public search fallback.

Keep participant records, videos, photos, exports, and credentials out of public commits, issues, and pull requests. The repository's ignore rules cover the default data directory and common local file types.

## Project structure

- `server.py` serves the app and manages the local SQLite database.
- `online.py` handles optional CMAS TV and Brave integrations.
- `web/` contains the browser interface, video controls, and metrics.

## License

DNF Lab is available under the [MIT License](LICENSE).

The bundled [hls.js 1.7.4](https://github.com/video-dev/hls.js/tree/v1.7.4) player is licensed separately under [Apache License 2.0](web/vendor/Apache-2.0.txt). Its [upstream copyright notices](web/vendor/hls.LICENSE) are included.
