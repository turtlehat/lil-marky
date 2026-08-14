# Why I Finally Stopped Writing Tests First

*Published March 14, 2026 — about 12 minutes to read*

I spent fourteen years as a test-driven evangelist. I gave the talks. I led the workshops. I wrote the blog posts that other people quoted. And somewhere around year twelve, I realized I'd been wrong about a piece of it the whole time — not the part about tests being important, but the part where I insisted on writing them *first*.

This is a long post. If you only have ten seconds, the takeaway is: **write the test second**, when the shape of the code is clear enough that the test isn't asking the design questions for you. The discipline of "test first" is real, and I'm not abandoning it. But I've replaced it with something I find more honest about how I actually think.

## How I Got Here

I came up in the era when test-first was treated as a moral position. You either did it, or you didn't, and the people who didn't were just confused about what good engineering looked like. I bought in completely. By 2014 I was teaching it at every shop I joined. I'd pair with juniors and refuse to let them touch the implementation file until they'd written the failing test.

For about a decade it served me well. The tests caught regressions. The code was more modular. The interfaces were cleaner because I'd been forced to think about them from the outside before I started filling in the inside.

Then around 2023 I started keeping notes on the moments where I actually felt productive — the days I shipped something I was proud of, where the code came out clean on the first or second try. I went back through six months of those notes and noticed a pattern: I almost never wrote the tests first on those days. I sketched, I poked at the problem, I wrote some throwaway code, I deleted it, I wrote some more, and *then* I wrote the tests. Almost as if the tests were the second draft.

That was uncomfortable. I'd been telling people for years to do the opposite of what I was actually doing on my best days.

## What I Was Actually Doing

I started watching myself more carefully. Here's what I noticed:

When the problem was familiar — a CRUD endpoint, a parser for a known format, a refactor of a module I knew well — test-first worked great. The interface was already clear in my head. The test just made it concrete.

When the problem was unfamiliar — a new domain, an algorithm I hadn't internalized, a integration with a service whose error surface I hadn't mapped — test-first made me *slower*. I'd sit there staring at a blank test file, trying to write `expect(thing).toBe(otherThing)` when I didn't even know what `thing` was going to look like.

So I'd cheat. I'd open a scratch file, write a little code, see if the shape made sense, and then go back and write the "test first" — but it wasn't really first. It was retrofitted. And retrofitted tests are weaker tests, because they tend to mirror the implementation choices rather than constrain them.

The pattern was: **test-first works when you know the answer, and stalls when you don't.**

> The test isn't always the right tool to discover the design. Sometimes the right tool is to write some code and see how it feels.

## The Reframe

Here's the way I think about it now. There are three modes I'm in when I'm coding:

**Mode 1: Familiar problem, known interface.** Write the test first. The test is faster to write than the implementation, and the implementation almost falls out of the test. Examples: adding a route, adding a method to an existing class, fixing a bug where you already know the reproducer.

**Mode 2: Unfamiliar problem, unclear interface.** Write the *prototype* first. Just code. Nothing reusable, nothing committed. The goal is to understand the shape. When you can sketch the interface on a whiteboard, switch back to mode 1.

**Mode 3: Refactor.** Tests already exist. Don't write new ones. Move the code, watch the existing tests, fix what breaks. Add tests only when you discover behavior that the existing tests don't cover.

The mistake I was making was treating mode 1 as the only legitimate mode. Mode 2 was something I did in secret because I thought it was bad practice. Mode 3 was something I'd pile new tests onto out of habit, even when the existing suite was already adequate.

## The Two-Hour Rule

The trick — the thing that took me embarrassingly long to figure out — is recognizing which mode I'm in before I start. I've settled on what I call the **two-hour rule**: if I can't picture the interface clearly enough to write a failing test within thirty minutes of starting on the problem, I'm in mode 2, and I should stop trying.

In mode 2, I give myself two hours of pure exploration. No tests. No commits. No "I'll just clean this up later" — the code is *going to be thrown away*, and I write it knowing that. The point is to learn what the problem actually wants.

After the two hours, one of three things has happened:

1. I understand the shape. I delete the prototype, switch to mode 1, and write the real thing test-first.
2. I'm closer but not there. I take notes, sleep on it, come back tomorrow with a fresh prototype.
3. I learn that the problem is different from what I thought. The original spec was wrong, or there's a simpler approach the original framing didn't allow. I go back to whoever asked for it.

The two-hour timebox is what made this work for me. Without it, mode 2 expanded to fill the whole day and I'd ship the prototype because "well, it works." With it, mode 2 stays exploratory and the production code still gets the discipline it needs.

## What I Tell Juniors Now

I used to tell juniors that test-driven development was the standard, and that not doing it was a sign they didn't understand testing. I don't say that anymore.

What I tell them now is:

- *Tests are not optional.* That part hasn't changed. Code without tests is a liability, full stop.
- *The order matters less than the existence.* A test written ten minutes after the code is 95% as good as one written ten minutes before, and infinitely better than one not written at all.
- *Know which mode you're in.* If the interface is clear, write the test first. If it's not, sketch. Don't pretend you know the answer when you don't.
- *If you're stuck on the test, write the prototype.* Then come back and write the test. Then delete the prototype. The prototype is a thinking tool, not a deliverable.

The version of me from 2014 would be horrified by this advice. I want to tell him: it's okay. You weren't wrong about tests. You were just wrong about how thinking actually happens.

## On Dogma

If you've read this far, you can probably guess what I'm going to say about engineering dogma in general. I don't think test-first is the only place where the religion outran the reasoning.

We do the same thing with microservices. With functional purity. With "no comments, code should be self-documenting." With pair programming as a universal rather than a tool. With agile ceremonies that were once thoughtful interventions and are now box-checking. Every one of these started as a real observation about a real problem and ossified into a rule that has to be followed regardless of context.

What I want, and what I'm trying to practice myself, is to **always know the why under the practice**. If I can articulate why I'm doing something in a specific situation, I can also articulate when not to do it. If I can't articulate the why, I'm probably cargo-culting.

So: write your tests. Write them first when that helps. Write them second when *that* helps. Don't write the same kind every time. And don't pretend you have it figured out — most of us don't, and the ones who say they do have stopped looking.

---

*Comments are open. I'm especially curious to hear from people who've made similar trade-offs in their own practice, and from people who think I'm wrong. Both are welcome.*
