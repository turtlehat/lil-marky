# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Experimental `--watch` flag on the CLI that re-runs the pipeline whenever any source file changes ([#612](https://github.com/example/dataflow/pull/612))
- `Pipeline.observe()` method that lets you tap into stage timings without changing topology ([#618](https://github.com/example/dataflow/pull/618))
- Support for `AbortSignal` on every async transform, propagating cancellation upstream ([#624](https://github.com/example/dataflow/pull/624))

### Changed
- `mapAsync` concurrency default is now `1` instead of `4` to match user expectations after [feedback in #589](https://github.com/example/dataflow/issues/589)
- Internal buffer is now a ring buffer instead of an array — measured ~12% faster on the standard benchmark suite ([#621](https://github.com/example/dataflow/pull/621))

### Deprecated
- `Pipeline.parallel(n)` — use `mapAsync(fn, n)` instead. Will be removed in 3.0.

## [2.4.0] - 2026-05-22

### Added
- `throttle(rate, window)` transform for rate-limiting downstream consumers. Supports both fixed and burst-allowed modes ([#598](https://github.com/example/dataflow/pull/598))
- `retry(fn, options)` wrapper for `mapAsync` that automatically retries failed items with exponential backoff ([#601](https://github.com/example/dataflow/pull/601))
- TypeScript declarations now ship with the package — no more `@types/dataflow` required ([#603](https://github.com/example/dataflow/pull/603))

### Changed
- `fromFile` now respects `highWaterMark` from Node's stream defaults rather than overriding it. Users who relied on the previous behavior can pass `chunkSize` explicitly ([#594](https://github.com/example/dataflow/pull/594))
- Error messages from `parseCSV` now include the line number and a preview of the offending row ([#599](https://github.com/example/dataflow/pull/599))

### Fixed
- Fixed a memory leak in long-running pipelines where stage subscriptions weren't being cleaned up after the source completed ([#591](https://github.com/example/dataflow/issues/591), [#592](https://github.com/example/dataflow/pull/592))
- `batch({ size, ms })` now correctly emits a partial batch when the time window expires, even if the size hasn't been reached ([#596](https://github.com/example/dataflow/pull/596))
- Resolved a race condition in `mapAsync` with concurrency > 1 where the output order could be non-deterministic under load ([#604](https://github.com/example/dataflow/pull/604))

### Performance
- File-to-file pipelines are now ~18% faster on Node.js 22 thanks to native iteration on the new `Buffer.prototype.subarray` fast path ([#606](https://github.com/example/dataflow/pull/606))

## [2.3.2] - 2026-04-10

### Fixed
- `toFile` no longer creates a zero-byte file when the upstream source completes without emitting any items ([#585](https://github.com/example/dataflow/issues/585))
- Corrected the type of `flatMap`'s callback parameter — it was wrongly inferred as `any[]` in TypeScript projects ([#587](https://github.com/example/dataflow/pull/587))

## [2.3.1] - 2026-03-15

### Fixed
- Hotfix: `fromArray` would skip the first item when used with `for await ... of` syntax due to a stale iterator state ([#578](https://github.com/example/dataflow/pull/578))

## [2.3.0] - 2026-03-01

### Added
- New `flatMap` transform — for each input, emit zero or more outputs ([#552](https://github.com/example/dataflow/pull/552))
- `Pipeline.metrics()` returns a snapshot of throughput, latency, and buffer occupancy for each stage ([#557](https://github.com/example/dataflow/pull/557))
- `fromEventEmitter(emitter, event)` source for adapting Node's `EventEmitter` to a pipeline source ([#561](https://github.com/example/dataflow/pull/561))

### Changed
- `filter` and `filterAsync` are now implemented in terms of `flatMap` internally. No behavior change, smaller bundle ([#553](https://github.com/example/dataflow/pull/553))
- The `collect()` sink now resolves with an empty array (instead of `undefined`) when the source produces no items. This is a behavior change but matches what most users expected ([#565](https://github.com/example/dataflow/pull/565))

### Fixed
- Fixed double-emit of errors when both `.catch()` and an unhandled error were present in the same pipeline ([#569](https://github.com/example/dataflow/pull/569))

## [2.2.0] - 2026-01-20

### Added
- `interval(ms)` source for ticking pipelines ([#510](https://github.com/example/dataflow/pull/510))
- Backpressure-aware `toSocket(addr)` sink that writes to a TCP socket ([#515](https://github.com/example/dataflow/pull/515))
- New `.catch(handler)` stage for inline error recovery ([#518](https://github.com/example/dataflow/pull/518))

### Changed
- The internal buffer size default changed from `16` to `64` items per stage. This significantly improves throughput on pipelines with cheap transforms ([#522](https://github.com/example/dataflow/pull/522))
- `mapAsync` errors are now wrapped in a `StageError` that includes the failing input. The original error is available as `.cause`. ([#524](https://github.com/example/dataflow/pull/524))

### Fixed
- `parseCSV` correctly handles quoted fields containing newlines ([#530](https://github.com/example/dataflow/pull/530))
- `fromFile` now waits for `'end'` *and* `'close'` before resolving, avoiding a race on slow filesystems ([#533](https://github.com/example/dataflow/pull/533))

### Performance
- ~30% throughput improvement on small-item pipelines after switching from `Promise.resolve()` to direct microtask scheduling in the stage runner ([#536](https://github.com/example/dataflow/pull/536))

## [2.1.0] - 2025-12-05

### Added
- TypeScript-first API surface: every transform infers input and output types from its callback signature ([#480](https://github.com/example/dataflow/pull/480))
- `parseCSV(options)` and `formatCSV(options)` built-in transforms ([#487](https://github.com/example/dataflow/pull/487))
- Optional `name` parameter on every stage for nicer error messages and metrics ([#491](https://github.com/example/dataflow/pull/491))

### Changed
- Minimum Node.js version is now 18 (was 16). Aligning with Node's own LTS schedule ([#476](https://github.com/example/dataflow/pull/476))
- Bundle size dropped from 18KB minified to 12KB after removing several internal helpers in favor of platform built-ins ([#494](https://github.com/example/dataflow/pull/494))

## [2.0.0] - 2025-10-10

### Breaking Changes
- The pipeline construction API now uses method chaining (`.pipe(...)`) exclusively. The old array-based `pipeline([source, transform, sink])` form has been removed. See the [2.0 migration guide](docs/migration-2.0.md) ([#420](https://github.com/example/dataflow/pull/420))
- `Source`, `Transform`, and `Sink` are no longer exposed as base classes. Use the factory functions (`source()`, `transform()`, `sink()`) instead ([#425](https://github.com/example/dataflow/pull/425))
- `Pipeline.start()` has been renamed to `Pipeline.run()` for clarity ([#428](https://github.com/example/dataflow/pull/428))

### Added
- New `mapAsync` transform with built-in concurrency control ([#432](https://github.com/example/dataflow/pull/432))
- New `batch(n)` transform for grouping items into arrays ([#435](https://github.com/example/dataflow/pull/435))
- Cancellation propagation: cancelling a sink cancels upstream stages ([#440](https://github.com/example/dataflow/pull/440))

### Removed
- Removed deprecated `Pipeline.legacy()` shim that was kept for 1.x compatibility ([#418](https://github.com/example/dataflow/pull/418))

## [1.4.2] - 2025-08-15

### Fixed
- `toFile` no longer crashes when the destination directory doesn't exist — it creates it recursively ([#395](https://github.com/example/dataflow/pull/395))

## [1.4.1] - 2025-07-28

### Fixed
- Minor: corrected a typo in an error message that referred to the wrong stage name ([#388](https://github.com/example/dataflow/pull/388))

## [1.4.0] - 2025-07-01

### Added
- `Pipeline.tee()` for fanning out to multiple sinks ([#370](https://github.com/example/dataflow/pull/370))
- `Pipeline.merge(other)` for combining streams of the same type ([#374](https://github.com/example/dataflow/pull/374))

### Performance
- Switched from per-stage `setImmediate` to a single shared task loop. Cuts overhead on long pipelines significantly ([#380](https://github.com/example/dataflow/pull/380))

[Unreleased]: https://github.com/example/dataflow/compare/v2.4.0...HEAD
[2.4.0]: https://github.com/example/dataflow/compare/v2.3.2...v2.4.0
[2.3.2]: https://github.com/example/dataflow/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/example/dataflow/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/example/dataflow/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/example/dataflow/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/example/dataflow/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/example/dataflow/compare/v1.4.2...v2.0.0
[1.4.2]: https://github.com/example/dataflow/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/example/dataflow/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/example/dataflow/compare/v1.3.0...v1.4.0
