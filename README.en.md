# PromptX

[中文 README](README.md)

PromptX is a local AI agent workspace built for long-running coding tasks.

It helps `Codex`, `Claude Code`, and `OpenCode` feel less like isolated CLI sessions and more like a structured workflow with better inputs, better outputs, and reusable context.

- Organize requirements, screenshots, notes, `md`, `txt`, and `pdf` before sending
- Bind each task to a stable project and working directory
- Review execution logs, final replies, run history, and code diffs in one place

If you already like agent CLIs but want a cleaner way to manage context, review code changes, and continue work across multiple rounds, PromptX is built for that.

```text
Task -> Project -> Directory -> Thread -> Run -> Diff
```

## At A Glance

- Keep using the agent you already prefer: `Codex`, `Claude Code`, or `OpenCode`
- Let PromptX organize tasks, projects, directories, threads, and run history
- Prepare context first, then send a better request
- Review process logs, final output, and code diffs on the same screen
- Extend from local use to remote access when needed

## What You Get

- A task workspace for ongoing collaboration, not a one-shot prompt box
- A reusable project layer that keeps the same working directory and agent thread together
- A persistent run history you can revisit later
- Built-in diff review for code-generating tasks
- Remote access options, including self-hosted Relay and an author-hosted service

## Why It Works Well For Codex / Claude Code / OpenCode Users

### Better Input Experience

- Tasks are durable context containers, not temporary prompts
- You can assemble text, screenshots, imported files, notes, and todos before sending
- Each task can be bound to a PromptX project, and each project can be bound to a fixed working directory
- Reuse the same project and thread for the same repo instead of repeating environment setup every round
- The input area supports text, images, `md`, `txt`, and `pdf`

### Better Output Experience

- Execution logs are visible in the center panel instead of being buried in terminal scrollback
- Every run keeps its prompt, event log, final reply, and summary
- Built-in code diff review makes it easier to inspect what the agent actually changed
- System diagnostics show runner concurrency, queueing, recovery, and stop-related states

### One Workspace For Multiple Engines

- PromptX currently supports `Codex`, `Claude Code`, and `OpenCode`
- The same task, project, event, and run UI works across all of them
- More engines can be added without changing the overall workflow

## Screenshots

All screenshots below use the `Glass Light` theme.

### Workspace Overview

Manage tasks on the left, inspect execution in the center, and prepare inputs on the right.

![PromptX workspace overview](docs/assets/readme-workbench-glass.png)

### Execution Focus

Review process logs, turn summaries, and final replies in one continuous view.

![PromptX execution focus](docs/assets/readme-execution-focus-glass.png)

### Code Diff Review

Inspect code changes by workspace, accumulated task history, or a single run.

![PromptX code diff review](docs/assets/readme-diff-glass.png)

### Project Manager

Bind tasks to a fixed project, working directory, and engine so context stays stable.

![PromptX project manager](docs/assets/readme-project-manager-glass.png)

### Remote Relay Settings

Configure remote access directly from the settings panel.

![PromptX relay settings](docs/assets/readme-settings-relay-glass.png)

### Mobile Remote Usage

PromptX can also be accessed remotely on mobile devices, which is a major highlight for many people who want to keep an eye on `Codex`, `Claude Code`, or `OpenCode` runs away from their desk.

![PromptX mobile remote access](docs/assets/readme-mobile-remote-glass.png)

## Core Workflow

### 1. Organize First, Then Send

Instead of dumping a large prompt into the agent immediately, collect the task goal, supporting files, screenshots, logs, and constraints first.

### 2. Bind The Task To A Stable Project

Projects keep the working directory and engine session stable, so future rounds do not need the same environment explanation again and again.

### 3. Review Process, Result, And Diff Together

PromptX makes one run easier to inspect by splitting it into three visible layers:

- Process: what the agent did
- Result: what the agent replied with
- Diff: what changed in the codebase

### 4. Continue Long Tasks Without Losing Structure

Long-running tasks keep their task context, project binding, and run history in place, instead of being scattered across terminal tabs and notes.

## Remote Access

PromptX supports full remote access workflows, not just temporary LAN exposure.

You can choose between:

- Local-only access for personal desktop use
- Self-hosted Relay on your own server
- The hosted remote service maintained by the author

For setup details, see:

- `docs/relay-quickstart.md`

### Self-Hosted Relay

Recommended if you want full control over your own domain, data flow, and access strategy.

- Good for users with a server and basic ops knowledge
- Suitable for personal long-term use or small internal teams
- Current docs already cover startup, tenants, domains, Nginx, and troubleshooting

### Author-Hosted Remote Service

If you do not want to deploy your own Relay, the author is already running a hosted remote service.

- Good for trying remote PromptX quickly
- Good for users who want mobile access without self-hosting first
- Limited seats are available; contact the author if you want an account

This hosted option is best treated as a convenience offering. If you need long-term guaranteed capacity, self-hosting is still the better path.

## Best Use Cases

- Prepare requirements, screenshots, and docs before sending a coding task
- Reuse the same working directory and thread across many rounds
- Review execution logs, final output, and code changes together
- Access PromptX remotely from a phone or another device
- Run PromptX on a remote machine for always-on personal usage

## Installation

```bash
npm install -g @muyichengshayu/promptx
promptx doctor
```

## Start

Default URL: `http://127.0.0.1:3000`

```bash
promptx start
promptx status
promptx stop
promptx relay start
```

## Development

```bash
pnpm install
pnpm dev
pnpm build
```

Workspace structure:

- `apps/web`: Vue 3 + Vite frontend
- `apps/server`: Fastify backend
- `apps/runner`: standalone runner process
- `packages/shared`: shared constants and event protocol

Screenshot generator used for the README:

- `scripts/capture-readme-screenshots.mjs`

## Supported Engines

- `Codex`
- `Claude Code`
- `OpenCode`

Related docs:

- `docs/agent-run-protocol.md`
- `docs/relay-quickstart.md`

## Notes

- PromptX is currently optimized for local-first, mostly single-user workflows
- Different engines may expose different tool capabilities and event richness
- Restricted engine permissions will directly affect file edits, command execution, and automation

## License

PromptX is licensed under `Apache-2.0`. See `LICENSE`.
