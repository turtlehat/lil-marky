# DataFlow

[![npm version](https://img.shields.io/npm/v/dataflow.svg)](https://www.npmjs.com/package/dataflow)
[![build status](https://img.shields.io/github/actions/workflow/status/example/dataflow/ci.yml)](https://github.com/example/dataflow/actions)
[![license](https://img.shields.io/npm/l/dataflow.svg)](https://github.com/example/dataflow/blob/main/LICENSE)

A small, fast, dependency-free stream pipeline for Node.js. Compose transforms with backpressure, observe stages, and drain to anywhere — a file, a socket, a queue, an HTTP response.

> Built for the kinds of pipelines that get rewritten three times before they're stable: ingest, transform, fan out.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Concepts](#concepts)
- [API](#api)
- [Recipes](#recipes)
- [Performance](#performance)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install dataflow
```

Or with your preferred package manager:

```bash
pnpm add dataflow
yarn add dataflow
bun add dataflow
```

DataFlow supports Node.js 18+ and works in both ESM and CommonJS:

```javascript
// ESM
import { source, transform, sink } from 'dataflow';

// CommonJS
const { source, transform, sink } = require('dataflow');
```

## Quick Start

A pipeline that reads a CSV, parses each row, filters out invalid records, and writes the result to a JSON file:

```javascript
import { fromFile, mapJSON, filter, toFile } from 'dataflow';

await fromFile('input.csv')
  .pipe(parseCSV({ headers: true }))
  .pipe(filter(row => row.email && row.email.includes('@')))
  .pipe(mapJSON(row => ({ id: row.id, contact: row.email })))
  .pipe(toFile('output.json'));
```

Every `.pipe()` returns a new stage. Stages are *lazy* — nothing runs until you `await` the final sink or call `.run()`.

## Concepts

A **pipeline** is a sequence of stages connected by typed channels. Each stage runs in its own microtask loop, so backpressure propagates automatically: if a downstream sink is slow, upstream stages pause until the buffer drains.

There are three kinds of stage:

1. **Sources** produce values. They never accept input. Examples: `fromFile`, `fromArray`, `fromEventEmitter`, `interval`.
2. **Transforms** read input, emit zero or more outputs. Examples: `map`, `filter`, `flatMap`, `batch`, `throttle`.
3. **Sinks** consume input and produce no output. The pipeline resolves when the sink completes. Examples: `toFile`, `toSocket`, `collect`, `forEach`.

A pipeline is just a source plus zero or more transforms plus exactly one sink.

### Backpressure

When a sink is slower than its source, DataFlow's default behavior is to *pause* upstream stages. The internal buffer between any two stages has a default capacity of 64 items; when full, the upstream stage suspends until space is available.

You can tune this per-pipeline:

```javascript
await fromFile('big.log')
  .pipe(parseLines(), { buffer: 1024 })  // bigger buffer between parse and downstream
  .pipe(filter(line => line.startsWith('ERROR')))
  .pipe(toSocket('localhost:9000'));
```

### Errors

Errors propagate forward by default — a thrown error in any stage cancels the pipeline. If you want to handle errors mid-pipeline, use the `.catch(handler)` stage:

```javascript
await fromFile('data.csv')
  .pipe(parseCSV())
  .catch((err, row) => console.warn('skipped row:', row, err.message))
  .pipe(toFile('clean.json'));
```

## API

### Sources

#### `fromFile(path, options?)`

Streams a file as `Buffer` chunks. Options:

- `chunkSize` — bytes per chunk (default `65536`)
- `encoding` — set to decode as strings instead of Buffers

```javascript
const lines = fromFile('access.log', { encoding: 'utf8' });
```

#### `fromArray(values)`

Emits each item in the array, in order.

```javascript
fromArray([1, 2, 3]).pipe(forEach(console.log));
// 1
// 2
// 3
```

#### `interval(ms, options?)`

Emits an incrementing counter every `ms` milliseconds. Useful for polling or heartbeats.

```javascript
interval(1000)
  .pipe(filter(n => n % 5 === 0))
  .pipe(forEach(n => console.log('tick', n)));
```

### Transforms

#### `map(fn)`

Synchronous one-to-one transform.

#### `mapAsync(fn, concurrency?)`

Like `map`, but `fn` may return a promise. Default concurrency is 1; pass a number for parallel execution.

```javascript
fromArray(urls)
  .pipe(mapAsync(fetch, 8))  // up to 8 concurrent fetches
  .pipe(forEach(handleResponse));
```

#### `filter(pred)` / `filterAsync(pred, concurrency?)`

Drop items where `pred(item)` is falsy.

#### `flatMap(fn)`

`fn` returns an array; each element becomes its own output item.

#### `batch(n)` / `batch({ size, ms })`

Buffer items and emit them as arrays. Either by count or by time window.

```javascript
inserts
  .pipe(batch({ size: 100, ms: 1000 }))  // 100 items OR 1 second, whichever first
  .pipe(mapAsync(rows => db.insertMany(rows)));
```

### Sinks

#### `toFile(path, options?)`

Write to a file. By default, items are coerced to strings with newlines between them. Pass `{ format: 'jsonl' }` for line-delimited JSON, or `{ format: 'binary' }` to write Buffers as-is.

#### `collect()`

Collect all items into an array, resolved when the source closes.

```javascript
const result = await fromArray([1, 2, 3])
  .pipe(map(n => n * 2))
  .pipe(collect());
// [2, 4, 6]
```

## Recipes

### Stream a large CSV without loading it into memory

```javascript
import { fromFile, parseCSV, filter, toFile } from 'dataflow';

await fromFile('huge.csv')
  .pipe(parseCSV({ headers: true }))
  .pipe(filter(row => row.amount > 1000))
  .pipe(toFile('big-orders.jsonl', { format: 'jsonl' }));
```

### Fan out to multiple sinks

```javascript
const events = fromKafka({ topic: 'orders' });

events.pipe(filter(e => e.type === 'created')).pipe(toFile('orders.jsonl'));
events.pipe(filter(e => e.type === 'failed')).pipe(toQueue('retries'));
events.pipe(mapAsync(notifyCustomer, 4)).pipe(drain());
```

### Rate-limited API consumer

```javascript
await fromArray(userIds)
  .pipe(throttle(10, '1s'))                    // 10 per second
  .pipe(mapAsync(id => api.getUser(id), 4))    // up to 4 concurrent
  .pipe(filter(user => user.active))
  .pipe(toFile('active-users.jsonl', { format: 'jsonl' }));
```

## Performance

DataFlow is designed to keep up with high-throughput pipelines without becoming a bottleneck itself. On a typical M2 MacBook:

- File-to-file pipeline (parse + filter + write): **~280 MB/s**
- In-memory transforms (map + filter): **~14M items/sec**
- HTTP fan-out at concurrency 32: **~3.5k requests/sec**

These are end-to-end numbers, not microbenchmarks — they include real I/O.

The library is zero-dependency and the bundle is ~12KB minified. Each transform allocates a single closure per stage, no per-item objects on the hot path.

## Contributing

Contributions welcome. The codebase is small (~1500 lines) and well-commented. To get started:

```bash
git clone https://github.com/example/dataflow
cd dataflow
npm install
npm test
```

The test suite uses the official [readable-stream-spec](https://github.com/example/readable-stream-spec) to verify Node Streams compatibility. Please run `npm run lint` and `npm run typecheck` before submitting a PR.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines, and check the [issue tracker](https://github.com/example/dataflow/issues) for places we could use help — anything tagged `good-first-issue` is a friendly entry point.

## License

MIT © DataFlow contributors. See [LICENSE](LICENSE) for details.
