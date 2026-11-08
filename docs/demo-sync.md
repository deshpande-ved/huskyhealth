# Demo: convenience mode (about 90 seconds)

Before going on camera: install the app from the public site, import an export once, and **pair off camera**. Pairing shows the write secret; never show it on screen or in the video.

1. **Off by default.** Show Settings → Convenience mode: `OFF (off by default)`. Read the four consent lines aloud (what is sent, who can read it, how long, how to turn it off).
2. **(Off camera) Pair.** Turn it on, copy the pairing code into the HuskyHealth Sync Shortcut once.
3. **Finish a workout** on the Watch (at least 10 minutes; the app finds it from the heart rate) and wait 10 minutes.
4. **Open Messages.** The automation runs silently: it counts the last 3 hours of heart-rate readings locally and, because there was a workout, sends one drop that the relay encrypts.
5. **Open HuskyHealth.** The status line says `Synced 1 new workout.` and the calendar, zones and load update.
6. **What the Pi held.** On the Mac, run `python3 relay/tools/dump_boxes.py`: one line per box, ciphertext length and the first 16 bytes in hex. No plaintext, no keys. (It runs the same code in-process on synthetic data.)
7. **Turn it off.** Settings → Turn off convenience mode. The phone deletes its key; the relay forgets the box. A `curl` GET on the old box now returns 404.

Honest caveats to say: with the mode on, the relay sees the drop in memory for milliseconds before encrypting it, and recent raw heart rate leaves the phone (encrypted at rest). With it off, nothing leaves.
