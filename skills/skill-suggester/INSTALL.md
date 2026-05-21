# Install

This skill is user-level (cross-project). Copy it to your local Claude skills dir:

```bash
mkdir -p ~/.claude/skills/skill-suggester
cp SKILL.md ~/.claude/skills/skill-suggester/
```

Verify it loaded by starting a Claude Code session and asking:

> what skills should I create?

Claude should invoke `skill-suggester` automatically based on the description's trigger keywords.

## Optional: schedule it

To run daily via gstack:

```
/loop 1d /skill-suggester
```

To run on session start after a long gap, add a SessionStart hook in `~/.claude/settings.json`. See the `update-config` skill or Claude Code docs for hook syntax.
