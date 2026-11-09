export type Spotlight = { name: string; path: string }
export type FeedbackRound = { round: number; text: string }

declare module 'claude-code' {
  interface PluginState {
    'skill-spotlight': {
      spotlight: Shaped<Spotlight | null>
      content: Shaped<string>
      draft: Shaped<string>
      rounds: Shaped<FeedbackRound[]>
    }
  }
}
