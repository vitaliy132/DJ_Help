# DJ Help

Find the tracks in a DJ set, match them to the closest SoundCloud upload, and save the artist’s original file when downloads are turned on.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Mixcloud links and pasted tracklists work before any keys are added. A sample house set is on the front page.

## Register these three

| Account | Where | Env vars | Turns on |
| --- | --- | --- | --- |
| SoundCloud Artist Pro | [Register an app](https://developers.soundcloud.com/docs/api/register-app) | `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET` | Search uploads and save the official download |
| AudD, with the enterprise endpoint | [Dashboard](https://dashboard.audd.io/) | `AUDD_API_TOKEN` | Identify a recording into a timestamped tracklist |
| Google Cloud | [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) | `YOUTUBE_API_KEY` | Read a YouTube description |

Mixcloud, Deezer, and iTunes Search need no account. Beatport, Bandcamp, and Traxsource are search links only.

SoundCloud Go+ cannot register an API app. After the keys are in `.env.local` and the server restarts, the APIs page calls each service and shows Connected or the rejection.

`AUDD_EVERY=1` and `AUDD_SKIP=2` recognize one 12-second chunk, then skip two. `AUDD_LIMIT=200` covers about two hours. Set `AUDD_SKIP=0` to scan every chunk. Enterprise billing is per recognized chunk.

## Saving audio

Save follows SoundCloud’s official download and only runs when the artist enabled it. The file is whatever they uploaded. Press **bitrate** on a row to read the size against the track length: 320 kbps, 256, lossless, and so on. Streams are not ripped, and nothing is upsampled to fake 320.
