# Getting Started with DataFlow

Welcome. By the end of this tutorial you'll have built a real, working pipeline that ingests a CSV file, validates and transforms each row, and writes the result to a JSON Lines file — with proper backpressure, error handling, and observability.

It's about 30 minutes of work, broken into seven steps. Let's go.

## Prerequisites

Before you start, make sure you have:

- **Node.js 18 or later** installed. Check with `node --version`.
- A terminal you're comfortable with. We'll use bash-style commands; PowerShell and zsh work the same.
- About 100 MB of disk space for the sample data and the project.
- A text editor of your choice — VS Code, Vim, Emacs, all fine.

> **Tip:** If you're on Windows, the commands below assume PowerShell or Git Bash. WSL also works.

## Step 1: Create a project

Let's set up a fresh directory:

```bash
mkdir dataflow-tutorial
cd dataflow-tutorial
npm init -y
```

That gives you a basic `package.json`. Now install DataFlow:

```bash
npm install dataflow
```

Open the directory in your editor. You should see:

```
dataflow-tutorial/
├── node_modules/
├── package.json
└── package-lock.json
```

We'll create the rest as we go.

## Step 2: Generate sample data

We need something to process. Create a file called `generate-data.js` with the following contents:

```javascript
import { writeFileSync } from 'node:fs';

const headers = 'id,name,email,signup_date,status,credit_balance\n';
const rows = [];

for (let i = 1; i <= 50_000; i++) {
  const id = i.toString().padStart(6, '0');
  const name = `User ${id}`;
  const email = i % 200 === 0
    ? `invalid-email-${id}`           // intentional bad data
    : `user${id}@example.com`;
  const date = new Date(2024, 0, 1 + (i % 730)).toISOString().slice(0, 10);
  const status = ['active', 'inactive', 'pending'][i % 3];
  const balance = (Math.random() * 1000).toFixed(2);
  rows.push(`${id},${name},${email},${date},${status},${balance}`);
}

writeFileSync('users.csv', headers + rows.join('\n'));
console.log(`Wrote ${rows.length} rows to users.csv`);
```

Now run it:

```bash
node generate-data.js
```

You should see `Wrote 50000 rows to users.csv` and a `users.csv` file (~3 MB) in your directory. Take a quick look at the first few lines:

```bash
head -5 users.csv
```

```
id,name,email,signup_date,status,credit_balance
000001,User 000001,user000001@example.com,2024-01-02,inactive,847.21
000002,User 000002,user000002@example.com,2024-01-03,pending,123.07
000003,User 000003,user000003@example.com,2024-01-04,active,512.50
000004,User 000004,user000004@example.com,2024-01-05,inactive,99.99
```

> **Note:** We seeded ~250 invalid emails (every 200th row). Your pipeline will need to handle them.

## Step 3: Your first pipeline

Create `pipeline.js`:

```javascript
import { fromFile, parseCSV, filter, map, toFile } from 'dataflow';

await fromFile('users.csv', { encoding: 'utf8' })
  .pipe(parseCSV({ headers: true }))
  .pipe(filter(row => row.email.includes('@')))
  .pipe(map(row => ({
    id: row.id,
    name: row.name,
    email: row.email.toLowerCase(),
    status: row.status,
    balance: parseFloat(row.credit_balance),
  })))
  .pipe(toFile('users.jsonl', { format: 'jsonl' }));

console.log('done');
```

Run it:

```bash
node pipeline.js
```

If everything worked, you should have a `users.jsonl` file. Check the line count:

```bash
wc -l users.jsonl
```

You should see something close to **49,750** — that's 50,000 rows minus the ~250 we filtered out as invalid. The exact number depends on how the modulo math worked out.

Open the file:

```bash
head -3 users.jsonl
```

```
{"id":"000001","name":"User 000001","email":"user000001@example.com","status":"inactive","balance":847.21}
{"id":"000002","name":"User 000002","email":"user000002@example.com","status":"pending","balance":123.07}
{"id":"000003","name":"User 000003","email":"user000003@example.com","status":"active","balance":512.5}
```

Congrats. You have a working pipeline.

## Step 4: Add error handling

Right now, if `parseFloat(row.credit_balance)` ever returns `NaN`, we'll silently write a bad record. Let's catch that.

Update the pipeline:

```javascript
import { fromFile, parseCSV, filter, map, toFile } from 'dataflow';

const stats = { processed: 0, skipped: 0 };

await fromFile('users.csv', { encoding: 'utf8' })
  .pipe(parseCSV({ headers: true }))
  .pipe(filter(row => row.email.includes('@')))
  .pipe(map(row => {
    const balance = parseFloat(row.credit_balance);

    if (Number.isNaN(balance)) {
      throw new Error(`bad balance: ${row.credit_balance}`);
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email.toLowerCase(),
      status: row.status,
      balance,
    };
  }))
  .catch((err, row) => {
    stats.skipped++;
    console.warn(`skip ${row?.id}: ${err.message}`);
  })
  .pipe(map(row => {
    stats.processed++;
    return row;
  }))
  .pipe(toFile('users.jsonl', { format: 'jsonl' }));

console.log(`processed: ${stats.processed}, skipped: ${stats.skipped}`);
```

> **Important:** `.catch()` recovers the pipeline for the *failing item only*. The item is dropped; everything else flows through.

Run it. You should see `processed: 49750, skipped: 0` because our test data doesn't have bad balances. Good — the safety net is in place.

## Step 5: Add observability

Real pipelines need metrics. DataFlow has `Pipeline.observe()` for that.

```javascript
import { fromFile, parseCSV, filter, map, toFile, observe } from 'dataflow';

const stats = { processed: 0, skipped: 0 };

await fromFile('users.csv', { encoding: 'utf8' })
  .pipe(observe('source'))
  .pipe(parseCSV({ headers: true }))
  .pipe(observe('parsed'))
  .pipe(filter(row => row.email.includes('@')))
  .pipe(observe('filtered'))
  .pipe(map(row => ({
    id: row.id,
    name: row.name,
    email: row.email.toLowerCase(),
    status: row.status,
    balance: parseFloat(row.credit_balance),
  })))
  .pipe(observe('transformed'))
  .pipe(toFile('users.jsonl', { format: 'jsonl' }));

console.log(`processed: ${stats.processed}, skipped: ${stats.skipped}`);
```

Now when you run it, you'll get a per-stage report at the end:

```
source        50000 items     67ms     746k items/sec
parsed        50000 items    134ms     373k items/sec
filtered      49750 items     14ms    3.4M items/sec
transformed   49750 items     89ms     559k items/sec
sink          49750 items    312ms    159k items/sec
```

This is incredibly useful when you're trying to find the bottleneck. In this case, the `toFile` sink is the slowest stage — file I/O usually is.

## Step 6: Add concurrency

What if your `map` stage involved an async operation — say, validating each email against a remote service? That's where `mapAsync` comes in.

Here's a contrived version that pretends each row needs an async validation:

```javascript
import { fromFile, parseCSV, filter, mapAsync, toFile } from 'dataflow';

async function validate(row) {
  // pretend this hits a real service
  await new Promise(resolve => setTimeout(resolve, 1));
  return { ...row, validated: true };
}

await fromFile('users.csv', { encoding: 'utf8' })
  .pipe(parseCSV({ headers: true }))
  .pipe(filter(row => row.email.includes('@')))
  .pipe(mapAsync(validate, 16))  // 16 concurrent validations
  .pipe(toFile('users-validated.jsonl', { format: 'jsonl' }));
```

The `16` is the concurrency. With concurrency `1`, your pipeline would take 49 seconds (each validation is 1ms, 49000 items). With concurrency `16`, it takes about 3 seconds.

> **Tip:** Concurrency isn't free. Each concurrent task uses memory. Match the number to your downstream service's rate limit — going wider doesn't help if the server rejects requests.

## Step 7: Cleanup

You now have a working, observable, error-resilient pipeline that handles 50K rows in under a second on a modest laptop. Let's clean up the artifacts:

```bash
rm users.csv users.jsonl users-validated.jsonl
```

Or keep them around if you want to play with the pipeline more.

## What you learned

In this tutorial, you:

1. **Built a basic CSV-to-JSON pipeline** using sources, transforms, and sinks
2. **Added error handling** with `.catch()` to skip bad records gracefully
3. **Added observability** with `observe()` to see per-stage throughput
4. **Introduced concurrency** with `mapAsync(fn, n)` for async transforms
5. **Used backpressure implicitly** — every stage pauses when the next one is slow, all automatic

These five ideas — *stages, error recovery, observation, concurrency, backpressure* — are the entire mental model for DataFlow. Everything else is composing these primitives.

## Next steps

- Read the [API reference](api.md) for the full list of built-in transforms.
- Try the [recipes](recipes.md) for common patterns: rate-limited consumers, fan-out, retries.
- Look at [advanced topics](advanced.md) when you're ready: writing custom transforms, integrating with other stream libraries, testing pipelines.

If you get stuck, the [discussions](https://github.com/example/dataflow/discussions) page is the best place to ask questions. The maintainers and a few regular contributors are usually quick to respond.

Happy piping.
