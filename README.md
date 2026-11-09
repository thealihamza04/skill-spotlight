# Skill Spotlight

A Claude Code mod that spotlights one skill and lets you improve it through feedback.

You pick a skill. The agent is told to read it first and follow it for every task. A side pane shows the skill's `SKILL.md` live, with a feedback box beside it. You review the agent's output, type what is wrong, and the agent turns those points into general rules in the skill. Then you give the next task, and the improved skill is used.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install skill-spotlight --marketplace thealihamza04/skill-spotlight
```

Answer `y` to add the marketplace, then choose a scope (user scope keeps it for every session).

From a shell:

```bash
claude plugin install skill-spotlight --marketplace thealihamza04/skill-spotlight
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `thealihamza04/skill-spotlight`, then **Add plugin**.

## Use

1. `/spotlight <skill name or path>` opens the pane. A name that matches an existing skill (project or `~/.claude/skills`) is used as is; a new name creates `~/.claude/skills/<name>/SKILL.md` from a template.
2. Give the agent a task. It reads the spotlighted skill first.
3. Review the output. In the pane's feedback box, write what is wrong, one point per line, and press Enter.
4. The agent updates the skill from your feedback. The pane redraws as the file changes.
5. Give the next task and repeat.

Other commands: `/spotlight` reopens the pane, `/spotlight off` clears the spotlight.

The pane needs a surface that draws text inputs (the desktop app or the terminal). The spotlighted skill is remembered across sessions.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

## License

MIT
