export type Phase = 'lobby' | 'upload' | 'caption' | 'vote' | 'reveal' | 'roundEnd' | 'gameEnd';

export type MediaKind = 'image' | 'gif' | 'video' | 'audio';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  score: number;
  rank: number;
  connected: boolean;
  isHost: boolean;
  roundDelta: number;
}

export interface Settings {
  rounds: number;
  captionSeconds: number;
  voteSeconds: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  settings: Settings;
  hostId: string | null;
  youId: string;
  phaseEndsAt: number | null;
  serverNow: number;
  players: PlayerView[];
  mediaCount: number;
  mediaIndex: number;
  minPlayers: number;
  maxPlayers: number;
  maxCaption: number;
  /** Taille max d'un média, en Mo (fixée par le serveur). */
  maxUploadMb: number;

  upload?: {
    youUploaded: boolean;
    submitted: number;
    expected: number;
    readyIds: string[];
  };

  media?: {
    id: string;
    url: string;
    kind: MediaKind;
    isYours: boolean;
    ownerId: string | null;
    reactions: { emoji: string; captionId: string | null; at: number }[];
  };

  caption?: {
    yourText: string;
    youSubmitted: boolean;
    submitted: number;
    expected: number;
    waitingOn: string[];
  };

  vote?: {
    captions: { id: string; text: string; isYours: boolean }[];
    yourBallot: Record<string, number> | null;
    youVoted: boolean;
    submitted: number;
    expected: number;
  };

  reveal?: {
    captions: {
      id: string;
      text: string;
      stars: number;
      voters: number;
      points: number;
      isBest: boolean;
      isYours: boolean;
      author: { id: string; name: string; avatar: string };
    }[];
    owner: { id?: string; name: string; avatar: string };
    bonus: number;
  };

  finalPodium?: { id: string; name: string; avatar: string; score: number; rank: number }[];
  winnerId?: string | null;
}

export interface UploadResult {
  url: string;
  kind: MediaKind;
  name: string;
  size: number;
}

export const EMOJIS = ['😂', '💀', '🔥', '😭', '🤡', '👏', '🤨', '❤️'] as const;

export const ACCEPT_ATTR =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg';
