/**
 * Coach Buchi's Afro-fusion library.
 * Tracks below ship as built-in references; admin can override via the
 * `generated_content.music_track` column at publish time.
 */
export interface AfroTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  src: string; // public audio URL
}

// Royalty-free Afro/percussive references (Pixabay CDN, public).
export const AFRO_LIBRARY: AfroTrack[] = [
  {
    id: "afro-drums-01",
    title: "Lagos Drum Ritual",
    artist: "Buchi Sessions",
    bpm: 110,
    src: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8e7a657d1.mp3",
  },
  {
    id: "afro-fusion-02",
    title: "Eko Pulse",
    artist: "Buchi Sessions",
    bpm: 124,
    src: "https://cdn.pixabay.com/download/audio/2023/07/30/audio_e0908e1a23.mp3",
  },
  {
    id: "afro-fusion-03",
    title: "Iron Sankofa",
    artist: "Buchi Sessions",
    bpm: 96,
    src: "https://cdn.pixabay.com/download/audio/2022/10/30/audio_347111d564.mp3",
  },
];