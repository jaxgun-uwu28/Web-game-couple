# Short prompts for future updates

AGENTS.md automatically supplies the scoped workflow. You do not need to paste the old project brief again.

```text
Follow PROJECT_SPEC.md.
Task: [one feature or bug, where it appears, expected behavior].
Acceptance: [specific observable result].
Implement directly; keep the existing design and architecture.
```

For a substantial redesign, request a bounded design proposal first, then implementation of the chosen direction. Routine fixes should proceed directly.

Choose reasoning in the app based on difficulty: lower/medium for copy, CSS and ordinary forms; higher for database security, multiplayer synchronization or repeated difficult failures. Repository instructions cannot change model selection or guarantee a token reduction. Do not use automatic model switching or extra agents for routine work.

Start a fresh chat for a separate bounded task when the old conversation is very long; point it at this repository and describe only the new task. Keep related unfinished work together. Compact docs reduce repeated discovery, but relevant code, required skill instructions and useful verification still need to be read.
