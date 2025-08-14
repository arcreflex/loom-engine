# Specs

## Intent

The architecture and intended behavior of this system should be captured in a set of "specs" that live in `specs/`.

- Audience: humans and AI agents collaborating to build and maintain the system.
- Specs should be the single source of truth for the system's design and behavior. Avoid duplicating spec content in other documents.
- Break specs up sensibly, with each domain or technical topic getting its own spec file
- Typically, specs should not redundantly capture code-level details such as data types, API contracts, invariants, that are more appropriately captured in the code itself

A good set of specs should:

- capture the architecture and intended behavior of the system
- "carve at the joints" of the system's structure and design
- avoid redundancy or fluff

The ideal state we are going for is that if we deleted every line of code, these specs would be sufficient to drive a high quality replacement implementation of the whole system.

## Layout

`AGENTS.md` should contain an index of specs. E.g.:

```
## Specification

Detailed specifications for each domain live in the `specs/` directory.

| Topic | Description | Link |

| --------------- | ------------------------------------------------ | ------------------------------------------- |
| Architecture | Overall system architecture and design decisions | [Architecture](specs/architecture.md) |
| Some component | ...description... | [Some component](specs/some-component.md) |
```

And all spec documents should live in a `specs/` dir at the root of the repo.

## Decisions

Use this space to log meta-level decisions we've made.

- We do not need an extensive spec for the API server, since it's really just intended to be a thin wrapper the server is really just a node in the architecture. (Certainly we don't need to detail each endpoint and its request/response types, since those are more appropriately captured in the code itself.)
