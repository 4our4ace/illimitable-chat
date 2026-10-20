// Price
// =====
// What a request used, as its vendor tells it (Usage): tokens read
// (input, cache writes and reads) and written, web searches, the speed
// it ran at. Agent.ts keeps the input each caller's last request read.

// Types
// =====

export type Usage = { input: number; write: number; read: number; output: number; searches: number; speed: string };

// Price
// =====

export namespace Price {

  // none yet, at a speed
  export function usage(speed: string): Usage {
    return { input: 0, write: 0, read: 0, output: 0, searches: 0, speed };
  }

}
