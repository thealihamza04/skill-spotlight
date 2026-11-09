import { atom, read, update } from 'claude-code'
import type { EngineInterface as $, Register } from 'claude-code'

import type { FeedbackRound, Spotlight } from '../types'

const PANE = 'skill-spotlight'
const TITLE = 'Skill spotlight'
const STORE_KEY = 'spotlight'
const MAX_CHARS = 90000

const spotlight = atom(
  { plugin: 'skill-spotlight', key: 'spotlight' } as const,
  null as Spotlight | null,
  { shape: 'spotlight-1' },
)
const content = atom({ plugin: 'skill-spotlight', key: 'content' } as const, '', {
  shape: 'content-1',
})
const draft = atom({ plugin: 'skill-spotlight', key: 'draft' } as const, '', {
  shape: 'draft-1',
})
const rounds = atom(
  { plugin: 'skill-spotlight', key: 'rounds' } as const,
  [] as FeedbackRound[],
  { shape: 'rounds-1' },
)

function skillTemplate(name: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: TODO, say what this skill does and when to use it.`,
    '---',
    '',
    `# ${name}`,
    '',
    '## Rules',
    '',
    '- (Rules learned from feedback go here.)',
    '',
  ].join('\n')
}

// Turns what the person typed after /spotlight into a SKILL.md path: a file,
// a folder holding SKILL.md, or a skill name under the project or user skills.
async function resolveSkill(
  $: $,
  arg: string,
): Promise<{ spot: Spotlight; isNew: boolean }> {
  const home = (await $.env.get('HOME')) ?? ''
  const cwd = await $.session.cwd()
  const raw = arg.replace(/^~(?=\/|$)/, home)
  const abs = raw.startsWith('/') ? raw : `${cwd}/${raw}`
  const name = raw.replace(/\/SKILL\.md$/, '').replace(/\/+$/, '').split('/').pop() ?? raw
  const candidates = raw.endsWith('.md')
    ? [abs]
    : [
        `${abs}/SKILL.md`,
        `${cwd}/.claude/skills/${raw}/SKILL.md`,
        `${home}/.claude/skills/${raw}/SKILL.md`,
      ]
  for (const path of candidates) {
    if (await $.fs.exists(path)) return { spot: { name, path }, isNew: false }
  }
  const path = raw.includes('/')
    ? (candidates[0] ?? abs)
    : `${home}/.claude/skills/${raw}/SKILL.md`
  await $.fs.write(path, skillTemplate(name))

  return { spot: { name, path }, isNew: true }
}

async function refresh($: $): Promise<void> {
  const spot = await read($, spotlight)
  if (!spot) return
  let text: string
  try {
    text = await $.fs.read(spot.path)
  } catch {
    text = `_Could not read ${spot.path}._`
  }
  if (text !== (await read($, content))) await update($, content, () => text)
}

async function setSpotlight($: $, spot: Spotlight | null): Promise<void> {
  await update($, spotlight, () => spot)
  await update($, rounds, () => [])
  await update($, content, () => '')
  if (spot) await $.store.set(STORE_KEY, spot)
  else await $.store.delete(STORE_KEY)
  await refresh($)
}

async function sendFeedback($: $, text: string): Promise<void> {
  const points = text.trim()
  const spot = await read($, spotlight)
  if (!points) return
  if (!spot) {
    $.ui.toast('Spotlight a skill first: /spotlight <name>')
    return
  }
  const round = (await read($, rounds)).length + 1
  await update($, rounds, list => [...list, { round, text: points }])
  await update($, draft, () => '')
  await $.prompt.submit({
    asUser: true,
    text: [
      `Feedback round ${round} on your last output, for the spotlighted skill "${spot.name}" (${spot.path}):`,
      '',
      points,
      '',
      `Improve ${spot.path} so future outputs avoid these problems. Turn each point into a clear, general rule or step in the skill (not a one-off patch for this output), keep the skill tidy and avoid duplicates. Do not redo the task unless I ask. Then list what you changed in the skill in a few bullets.`,
    ].join('\n'),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'spotlight',
      description:
        'Spotlight a skill (name or path): the agent uses it, the pane shows it and takes your feedback. "/spotlight off" clears it.',
    })
    const kept = (await $.store.get(STORE_KEY)) as Spotlight | undefined
    if (kept && !(await read($, spotlight))) await update($, spotlight, () => kept)
    await refresh($)
    $.clock.every(2000, () => void refresh($))
    if (await read($, spotlight)) void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'spotlight' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off') {
      await setSpotlight($, null)
      return { text: 'Skill spotlight cleared.' }
    }
    if (arg) {
      const { spot, isNew } = await resolveSkill($, arg)
      await setSpotlight($, spot)
      await $.ui.open({ id: PANE, title: TITLE })
      return {
        text: `${isNew ? 'Created and spotlighted' : 'Spotlighted'} skill "${spot.name}" (${spot.path}).`,
      }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    const spot = await read($, spotlight)

    return {
      text: spot
        ? `Spotlighted skill: "${spot.name}" (${spot.path}).`
        : 'No skill spotlighted. Use /spotlight <skill name or path>.',
    }
  })

  // Tells the model which skill is spotlighted, every request.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const spot = await read($, spotlight)
    if (!spot) return composed

    return {
      sections: [
        ...composed.sections,
        {
          id: 'skill-spotlight:active',
          scope: 'session',
          text: [
            `# Spotlighted skill`,
            `The person has spotlighted the skill "${spot.name}", whose file is ${spot.path}.`,
            `- For every task they give you, read that file first and follow it as your main instructions, even when its description does not seem to match.`,
            `- When they send feedback on an output, edit that file so the skill itself gets better: turn each point into a general rule or step, keep it organized, and say briefly what changed.`,
            `- Keep the file's YAML frontmatter (name, description) valid.`,
          ].join('\n'),
        },
      ],
    }
  })

  // Redraw right after the agent edits the file, without waiting for the poll.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'Bash') await refresh($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Markdown } = ui
    const spot = await read($, spotlight)
    const text = await read($, content)
    const typed = await read($, draft)
    const history = await read($, rounds)
    const wide = (e.props?.bodyColumns ?? 80) >= 70

    if (!spot) {
      return (
        <Box flexDirection="column">
          <Text bold>No skill spotlighted yet</Text>
          <Text dimColor size="caption">
            /spotlight &lt;name or path&gt;, a new name creates ~/.claude/skills/&lt;name&gt;
          </Text>
        </Box>
      )
    }

    const lines = text ? text.split('\n').length : 0
    const header = (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text bold wrap="truncate-end">{spot.name}</Text>
        <Text dimColor size="caption" wrap="truncate-middle">
          {lines} lines · {history.length} round{history.length === 1 ? '' : 's'} sent
        </Text>
      </Box>
    )

    const input =
      'Input' in ui ? (
        <ui.Input
          key="feedback"
          placeholder={"What's wrong with the output? One point per line"}
          value={typed}
          rows={3}
          submitLabel="send"
          onInput={value => void update($, draft, () => value)}
          onSubmit={value => void sendFeedback($, value)}
        />
      ) : (
        <Text dimColor size="caption">Feedback needs the desktop app or the terminal.</Text>
      )

    const feedback = (
      <Box flexDirection="column" width={wide ? '34%' : '100%'} flexShrink={0}>
        {input}
        {history
          .slice(-4)
          .reverse()
          .map(one => (
            <Text dimColor size="caption" wrap="truncate-end">
              #{one.round} {one.text.replace(/\s*\n\s*/g, ' · ')}
            </Text>
          ))}
      </Box>
    )

    const skill = (
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        width={wide ? '66%' : '100%'}
        borderStyle="single"
        borderDimColor
        paddingX={1}
      >
        <Markdown text={text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n…` : text || '_Empty file._'} />
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Box flexDirection={wide ? 'row' : 'column'} gap={1}>
          {feedback}
          {skill}
        </Box>
      </Box>
    )
  })
}
