'use strict';

/** Phases du jeu — ordre de progression :
 *  lobby -> upload -> [caption -> vote -> reveal] x N medias -> roundEnd -> (upload...) -> gameEnd
 */
const PHASE = {
  LOBBY: 'lobby',
  UPLOAD: 'upload',
  CAPTION: 'caption',
  VOTE: 'vote',
  REVEAL: 'reveal',
  ROUND_END: 'roundEnd',
  GAME_END: 'gameEnd',
};

const LIMITS = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 10,
  MAX_NAME: 16,
  MAX_CAPTION: 140,
  CODE_LENGTH: 6,
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  ROOM_TTL_MS: 4 * 60 * 60 * 1000, // room purgée après 4h d'inactivité
  DISCONNECT_GRACE_MS: 90 * 1000,
};

const DURATIONS = {
  UPLOAD: 150,
  CAPTION: 55,
  VOTE: 40,
  REVEAL: 11,
  ROUND_END: 9,
};

const DEFAULT_SETTINGS = {
  rounds: 3,
  captionSeconds: DURATIONS.CAPTION,
  voteSeconds: DURATIONS.VOTE,
};

const STAR_MIN = 1;
const STAR_MAX = 5;
const BEST_CAPTION_BONUS = 3;

const MIME_KIND = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'gif',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/ogg': 'audio',
};

const EMOJIS = ['😂', '💀', '🔥', '😭', '🤡', '👏', '🤨', '❤️'];

const AVATARS = ['🦊', '🐸', '🐙', '🦖', '🐧', '🦄', '🐨', '🦁', '🐳', '🦉'];

module.exports = {
  PHASE,
  LIMITS,
  DURATIONS,
  DEFAULT_SETTINGS,
  STAR_MIN,
  STAR_MAX,
  BEST_CAPTION_BONUS,
  MIME_KIND,
  EMOJIS,
  AVATARS,
};
