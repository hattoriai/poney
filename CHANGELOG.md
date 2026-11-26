# Changelog

Every package in this repository has the same version. The format has its own version, in `poneyVersion` (see [spec/SPEC.md](spec/SPEC.md)).

## 0.2.0

### Format 0.2.0

The format now uses the names of the notations it draws. Readers upgrade 0.1.0 documents automatically; writers write 0.2.0. [SPEC.md section 11](spec/SPEC.md) lists each change.

- Entity kinds `module` → `component` (C4) and `queue` → `message-broker`.
- Cardinalities `one` → `exactly-one` and `many` → `zero-or-many` (crow's foot).
- `capabilities` → `useCases`, and refs `capability:` → `useCase:` (UML).
- Behaviour `process` → `activity`, with nodes `initial` and `final` (UML); state kind `normal` → `state`.
- View category `capabilities` → `use-cases`; tone `poney` → `accent`.
- `@hattoriai/poney-core` exports `upgradeDocument`.

### Studio

- Connecting an agent from the start page opens the folder's project. An agent's document never goes into the project or file of a different folder.
- Without an agent, agent actions show greyed, with a way to connect one.
- The Studio connects to the local server again after the server restarts.
- No focus ring under the search box.

## 0.1.1

- The CLI is published as `@hattoriai/poney` and requires Node 22.

## 0.1.0

- First release.
