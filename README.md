# Subarr

*After [a lot of feedback](https://reddit.com/r/selfhosted/comments/1myldh3/i_built_youtubarr_the_sonarr_for_youtube/nacw3am/), I've decided to rename this project from "YouTubarr" to "Subarr". The name "Subarr" also helps define the project a little clearer in how it's based on RSS subscriptions (intended to be a "subscribe to playlists/channels & take action on new uploads") rather than a full PVR & media management system. If you're looking for a more true "Sonarr for YouTube", I recommend checking out one of the solutions below.*

Subarr is a **lightweight** YouTube channel/playlist/subscription follower that will take action on new uploads (actions can be a webhook - like Discord - or a process - like downloading through yt-dlp). "Lightweight" means it needs few resources and can run on something like a raspberry pi.

<img width="1220" height="774" alt="image" src="https://github.com/user-attachments/assets/dd9b42d8-08e9-4d9a-a175-acf7219d059a" />


### Background

This is an attempt to create a Sonarr-like application for YouTube videos. A lot of inspiration has been taken from Sonarr (mostly the UI), but this has been written entirely from scratch.

_Why not use one of the existing solutions?_

Here are all the similar things I could find and how this is different:
| Name | Active? | Stars | Indexer | Comment |
|----------------------|---------|-------|---------|---------|
| [Tube Archivist](https://github.com/tubearchivist/tubearchivist) | ✅ | ![](https://img.shields.io/github/stars/tubearchivist/tubearchivist?label=&style=flat-square&color=white) | yt-dlp | Based on yt-dlp |
| [Pinchflat](https://github.com/kieraneglin/pinchflat) | ✅ | ![](https://img.shields.io/github/stars/kieraneglin/pinchflat?label=&style=flat-square&color=white) | yt-dlp (but can also do RSS for "fast-sync") | |
| [ytdl-sub](https://github.com/jmbannon/ytdl-sub) | ✅ | ![](https://img.shields.io/github/stars/jmbannon/ytdl-sub?label=&style=flat-square&color=white) | yt-dlp | No UI |
| [TubeSync](https://github.com/meeb/tubesync) | ✅ | ![](https://img.shields.io/github/stars/meeb/tubesync?label=&style=flat-square&color=white) | yt-dlp | |
| [YTPTube](https://github.com/arabcoders/ytptube) | ✅ | ![](https://img.shields.io/github/stars/arabcoders/ytptube?label=&style=flat-square&color=white) | yt-dlp | Essentially a web UI wrapper around yt-dlp |
| [Youtarr](https://github.com/DialmasterOrg/Youtarr) | ✅ | ![](https://img.shields.io/github/stars/DialmasterOrg/Youtarr?label=&style=flat-square&color=white) | yt-dlp | |
| [Youtubarr](https://github.com/DireDireCrocs/Youtubarr) | ✅ | ![](https://img.shields.io/github/stars/DireDireCrocs/Youtubarr?label=&style=flat-square&color=white) | YouTube API | Focused on music videos & [Lidarr](https://lidarr.audio/) integration (also only recently created) |
| [Subscribarr](https://github.com/jschaufuss/subscribarr) | ✅ | ![](https://img.shields.io/github/stars/jschaufuss/subscribarr?label=&style=flat-square&color=white) | RSS feeds | Includes YouTube playlists but is more generic *arr management (Sonarr & Radarr) |
| [Tubarr](https://github.com/TubarrApp/Tubarr) | ✅ | ![](https://img.shields.io/github/stars/TubarrApp/Tubarr?label=&style=flat-square&color=white) | yt-dlp | No UI, “pre-pre-pre-alpha” status |
| [MetaTube](https://github.com/JVT038/MetaTube) | ❌ | ![](https://img.shields.io/github/stars/JVT038/MetaTube?label=&style=flat-square&color=white) | N/A | Seems to only handle individual videos, not playlists |
| [Ytmdl](https://github.com/deepjyoti30/ytmdl) | ❌ | ![](https://img.shields.io/github/stars/deepjyoti30/ytmdl?label=&style=flat-square&color=white) | youtube-dl | Also music-video specific |
| [Tubarr (Capstone Project)](https://vc.bridgew.edu/cgi/viewcontent.cgi?article=1691&context=honors_proj) | ❌ | N/A | yt-dlp | Private (a student's capstone project) |


As you can see, there's a few other solutions, but most are based on [yt-dlp](https://github.com/yt-dlp/yt-dlp) for getting playlist information. This works fine if you want to index an _entire playlist_ (which a user may, very well, want to do) but it can require a LOT of polling activity (particularly for large channels). _Tube Archivist above even calls out 2-4GB of memory dedicated to its functionality._ **This project is lightweight and can easily run on a raspberry pi or similar.** Additionally, none of the above services can automatically keep your actual subscriptions on YouTube in sync with the app.

Sonarr is based on RSS feeds - explicitly designed for this purpose of getting new updates from subscription-like sources. This is much lighter in processing requirements. I've also tried to make this UI as similar as possible to the other *arr apps for familiarity.

_What are the limitations of the RSS feed approach?_

YouTube already provides RSS feeds for playlists (eg https://www.youtube.com/feeds/videos.xml?playlist_id=PLopY4n17t8RDoFQPcjBKWDEblGH1sOH2h). However, they can be severly limited:

- Feeds seem to be limited to only the last 15 items
  - _However, Subarr will list more items as they are found because the internal database will be updated_
  - Since the feed is limited to only the last 15 items, if (for some reason) Subarr is down for an extended period of time (or a large amount of videos are published to the playlist in a short period of time), Subarr may miss some videos entirely.
- YouTube RSS feed items are always in "playlist order", meaning a new video added outside of the first 15 items will not be seen as an update to the RSS feed
  - This means that, currently, RSS feeds _**will not work**_ in the following situations: (issue logged with YouTube: https://issuetracker.google.com/issues/429563457)
    - YouTube playlists greater than 15 items where items are added outside the "top 15" (regular playlists can be in _any order_ - as determined by the playlist owner - which means that "newly added items" aren't necessarily at the top. Some creators' playlists are ordered oldest -> newest)
    - \>=15 items added to a playlist quickly (eg if a playlist has 1 item, then when it updates 15 minutes later it has 20 items, 4 of those items will be missed because only the top 15 will be in the RSS feed)
- RSS feeds may be somewhat slow to update (updates are approximately every 15 minutes). _15 minutes is pretty fast, but other methods (like the direct YouTube API - or perhaps even TubeSync's yt-dl method) could check for new videos even faster_
- _[May not be a big deal]_ RSS feeds will not include "Members Only" items

However, this works perfectly fine for mine (and maybe other people's) needs.


### Notes

⚠️ **Subarr currently does not implement any sort of authetication. It is highly recommended that you do not expose your instance to the internet (or, at least, put it behind a form of authentication like nginx or Cloudflare)** ⚠️

Subarr is NOT intended to do the following:
- Index an entire channel/playlist or get "older" videos. Subarr's RSS approach is specifically for "subscriptions": new video is posted, take some action
- Media management. Once Subarr kicks off the post-processor (like yt-dlp), its job is done. Use Plex/Jellyfin/etc or another one of the linked solutions above if you require more control over your media


### Current features

- Add playlists
- Limit playlist items by regular expression
- Exclude shorts
- [ytsubs.app](https://github.com/derekantrican/ytsubs) integration to import user's YouTube subscriptions and keep them in sync
- Post processors (an action to run when a new video is found)
  - Webhook: call a webhook (eg Discord, Raindrop.io, etc)
  - Process: execute a process (eg yt-dlp to download the video)

### Future features

- API key for authenticating calls to the server
- It would be neat to have some sort of web socket or other real-time communication between the server & client that will do things like updating the "last checked" or video list on the UI
- Native "url base" support like sonarr (for reverse proxies or cloudflare tunnels)
- Backup & Restore functionality (_should_ be pretty easy by just giving a copy of the sqlite db?)
- _Index more than 15 items initially? (this would require significant up-front processing power like TubeSync does - so...unlikely)_


### Installation

#### Docker (Recommended)

```bash
git clone https://github.com/derekantrican/subarr.git
cd subarr
docker-compose up -d
```

The app will be available at `http://localhost:3001`

#### Helpful Docker Scripts

From the project root you can use the following npm scripts (they just wrap common docker-compose commands):

```
npm run docker:run       # Start (build if needed) in background
npm run docker:logs      # Follow logs
npm run docker:stop      # Stop and remove container
npm run docker:update    # git pull then rebuild using latest base images and recreate
npm run docker:restart   # Restart container (down + up -d)
```

Typical update workflow if you deployed via git clone:

```
cd subarr
npm run docker:update
```

#### Manual Installation

Make sure you have Node >= 18 installed, then run the following:

```
git clone https://github.com/derekantrican/subarr.git
cd subarr
npm install
# optionally create server/.env with PORT=5000 or whatever
npm run start-server # On Windows, use 'npm run start-server-win'
```

And if you'd like to set it to run at startup, put that last command into a .service file (Linux) or your Startup folder (Windows).

### Plans for future maintenance

I am currently just building this as a hobby project for myself and I already have about 10x the amount of hobby projects that I can handle. I'll probably fix some bugs or maintenance issues as they arise, but I don't plan to work on any major features. If you'd like to contribute, please reach out!
