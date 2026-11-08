---
slug: csi-rs
title: csi-rs
category: Embedded and wireless
summary: Open-source Rust tooling for Wi-Fi Channel State Information on ESP32. A no_std driver, a flash-and-go CLI, a terminal UI, a desktop GUI and a host web server.
tags: [rust, esp32, wifi, csi, embedded, no-std, 802.11bf]
repo_url: https://github.com/csi-rs/esp-csi-rs
featured: true
sort_order: 30
related: []
---

## What it is

Channel State Information (CSI) is what a Wi-Fi radio measures about the channel between two devices: how each subcarrier was changed on its way through the room. It is the raw material for Wi-Fi sensing, such as detecting motion or presence without a camera. csi-rs is a set of Rust tools for collecting it on ESP32 boards and getting it to a computer in a usable form.

## Design goals

Make the measurement setup explicit instead of implied by a pile of flags. Run on bare metal in Rust. Give host programs the same typed data the firmware produces, so nobody has to parse text. Keep compatibility with existing CSI tooling, which is why one of the output formats is the ESP32-CSI-Tool CSV layout.

## The pieces

| Tool | What it does |
| --- | --- |
| `esp-csi-rs` | The `no_std` driver crate. Built on `esp-hal` and `esp-radio`, it captures CSI and delivers it. Works with Embassy async. |
| `esp-csi-cli-rs` | Firmware with a command line over serial. Flash it and configure the board with commands, no application code. Supports ESP32, ESP32-C3, C5, C6 and S3. |
| `esp-csi-tui-rs` | Terminal UI to visualize CSI live. Developed with the 42-DDN group. |
| `csi-gui-rs` | Desktop GUI for live capture from one or many boards at once. |
| `csi-webserver-rs` | Host server that finds boards over USB, bridges them to HTTP and WebSocket clients, and can write Parquet session dumps. |

## A model, not just a capture loop

The crate describes a sensing network with the vocabulary of IEEE 802.11bf, the Wi-Fi sensing standard. Each node has four independent attributes: its mode (how it reaches the channel), its session role (who starts a measurement session), its sensing role (transmitter, receiver or both), and its reporting policy (how measurements leave the node).

```rust
// One constructor per mode. The roles come with the mode.
CsiNode::sniffer(...)
CsiNode::station(...)
CsiNode::access_point(...)
CsiNode::emitter(...)
CsiNode::esp_now(...)
```

Capture and delivery are separate paths. The capture path is the callback inside the Wi-Fi task that copies the measurement into a record. The delivery path decides where the record goes: a host over serial or the network, a local handler, or nowhere. Output can be postcard frames with COBS, plain text, a compact array, the ESP32-CSI-Tool CSV layout, or `defmt`.

The wire format is `no_std`, radio-neutral and free of `esp-*` imports. A host program decodes frames with the exact same types the firmware encodes, so there is no second, hand-written parser to keep in sync.

## From the command line

```sh
set-wifi --mode=station --reporting=report
set-measurement --periodicity-hz=100
show-config
show-stats
```

`show-stats` reports packets per second, rates and drops, with drops broken down by cause, which is usually the first thing you need when a capture looks wrong.

## Status

Active. The driver crate is published on crates.io. The project started in late 2024 and has grown from a single crate into the toolset above. The first supported targets are the ESP32 family listed above.

## Links

- Driver: [csi-rs/esp-csi-rs](https://github.com/csi-rs/esp-csi-rs)
- CLI: [csi-rs/esp-csi-cli-rs](https://github.com/csi-rs/esp-csi-cli-rs)
- Terminal UI: [42-DDN/esp-csi-tui-rs](https://github.com/42-DDN/esp-csi-tui-rs)
- Desktop GUI: [csi-rs/csi-gui-rs](https://github.com/csi-rs/csi-gui-rs)
- Host server: [csi-rs/csi-webserver-rs](https://github.com/csi-rs/csi-webserver-rs)
