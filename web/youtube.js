const states = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 };

let apiRequest;
function youtubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiRequest) {
    apiRequest = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const prior = window.onYouTubeIframeAPIReady;
      const timeout = setTimeout(fail, 15000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        window.onYouTubeIframeAPIReady = prior;
        reject(new Error('Could not connect to the YouTube player.'));
      }
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout);
        window.onYouTubeIframeAPIReady = prior;
        resolve(window.YT);
        prior?.();
      };
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = fail;
      document.head.append(script);
    }).catch(error => {
      apiRequest = null;
      throw error;
    });
  }
  return apiRequest;
}

const errors = {
  5: 'YouTube could not play this video in the browser.',
  100: 'This YouTube video is unavailable.',
  101: 'The video owner has restricted embedded playback.',
  150: 'The video owner has restricted embedded playback.',
  153: 'YouTube refused playback from this browser.',
};

export function attachYouTube(host, id, position, { ready, update, onPlay, error }) {
  let player;
  let active = true;
  let poll;
  let timeout;
  let seekTarget;
  let seekUntil = 0;
  let playbackStarted = false;
  const startPlayback = () => {
    playbackStarted = true;
    onPlay();
  };
  const frame = document.createElement('iframe');
  const url = new URL('https://www.youtube.com/embed/' + id);
  url.search = new URLSearchParams({ enablejsapi: '1', origin: location.origin, playsinline: '1',
    start: String(Math.floor(position)), rel: '0' });
  frame.src = url.href;
  frame.title = 'YouTube video player';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  frame.allowFullscreen = true;

  const playback = {
    get currentTime() {
      const time = player?.getCurrentTime?.();
      const state = player?.getPlayerState?.();
      return time === undefined || time === 0 && (state === -1 || state === states.cued) ? position : time;
    },
    set currentTime(time) {
      seekTarget = time;
      seekUntil = performance.now() + 1000;
      if ([-1, states.cued].includes(player.getPlayerState())) {
        position = time;
        player.cueVideoById({ videoId: id, startSeconds: time });
      } else player.seekTo(time, true);
    },
    get seeking() {
      if (Math.abs(playback.currentTime - seekTarget) < .2) seekUntil = 0;
      return performance.now() < seekUntil || player?.getPlayerState() === states.buffering;
    },
    get duration() { return player?.getDuration?.() || 0; },
    get paused() { return ![states.playing, states.buffering].includes(player?.getPlayerState()); },
    get readyState() {
      return playback.duration > 0 && player.getPlayerState() !== states.buffering ? 2 : 0;
    },
    get muted() { return player?.isMuted?.() ?? false; },
    set muted(value) { if (value) player.mute(); else player.unMute(); },
    get playbackRate() { return player?.getPlaybackRate?.() || 1; },
    set playbackRate(rate) { player.setPlaybackRate(rate); },
    get availableRates() { return player?.getAvailablePlaybackRates?.() ?? [1]; },
    play() { player.playVideo(); startPlayback(); return Promise.resolve(); },
    pause() { player?.pauseVideo?.(); },
    requestFullscreen() { return frame.requestFullscreen(); },
  };

  const fail = message => {
    if (active) error(message + ' Use Source to open it on YouTube.');
  };
  youtubeAPI().then(YT => {
    if (!active) return;
    host.replaceChildren(frame);
    timeout = setTimeout(() => fail('The YouTube player did not respond.'), 18000);
    player = new YT.Player(frame, {
      events: {
        onReady(event) {
          if (!active) return;
          clearTimeout(timeout);
          player = event.target;
          if (!Number.isInteger(position)) player.cueVideoById({ videoId: id, startSeconds: position });
          ready(playback);
          poll = setInterval(update, 180);
        },
        onStateChange(event) {
          if (!active || !poll) return;
          update();
          if (event.data === states.playing && !playbackStarted) {
            startPlayback();
          } else if ([states.paused, states.ended, states.cued, states.unstarted].includes(event.data)) {
            playbackStarted = false;
          }
        },
        onPlaybackRateChange: () => { if (active && poll) update(); },
        onError: event => fail(errors[event.data] ?? 'YouTube playback failed.'),
      },
    });
  }).catch(reason => fail(reason.message));
  return {
    destroy() {
      active = false;
      clearInterval(poll);
      clearTimeout(timeout);
      player?.destroy?.();
      frame.remove();
    },
  };
}
