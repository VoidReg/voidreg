---
slug: sidermux
title: Sidermux and FPGA tooling
category: FPGA and bare metal
summary: Bare-metal Rust for SoC FPGAs, starting with Cyclone V on the DE1-SoC, plus fixes sent upstream to LiteEth and nextpnr.
tags: [rust, fpga, bare-metal, cyclone-v, armv7a, litex, nextpnr, rgmii]
repo_url: https://github.com/sidermux/sidermux-hal
featured: false
sort_order: 50
related: []
---

## What it is

Sidermux is a set of Rust crates for SoC FPGAs, where a hard ARM processor sits next to programmable logic on the same chip. The first target is the Intel Cyclone V (dual Cortex-A9, `armv7a-none-eabi`) on the Terasic DE1-SoC board. The goal is one interface across architectures, SoCs and boards, written so that a new chip adds a layer instead of forking everything above it.

## How the HAL is layered

Each layer has one job, and only the layer below it knows about the hardware.

| Crate | Responsibility |
| --- | --- |
| `sidermux-pac` | Typed peripheral handles, register layouts and fields |
| `sidermux-hal` | Reusable drivers for the SoC and the CPU architecture |
| `sidermux-bsp` | Board wiring, handoff data and initialization |
| `sidermux-rt` | Runtime startup, selected per architecture |
| `sidermux-bootloader` | Bootable image, with SoC boot profiles |

SoC and architecture support live in the HAL. Board support lives in the BSP. Only Cyclone V is claimed as supported. Nothing else is claimed until it works.

```sh
cargo build -p sidermux-bootloader --target armv7a-none-eabi --features board-de1-soc
```

## Firmware tools

`sidermux-fwtools` packages, inspects and unpacks boot images for SoC FPGAs. It separates reusable host operations from family boot contracts and from board storage policy. The `cargo sidermux` command wraps it:

```sh
cargo sidermux boards
cargo sidermux pack bootloader.elf --board cyclone-v-generic --output system.sd.img
cargo sidermux inspect system.sd.img
cargo sidermux unpack system.sd.img --output unpacked/
```

The image codecs and checksums live in a separate `no_std` crate, so the same code can run on the board and on the host.

## Work sent upstream

Two fixes found while working with FPGA tools, sent to the projects that own them.

**LiteEth: RGMII receive errors.** An RGMII PHY can flag a bad frame through the control signal even when the checksum is correct, and the MAC has to see that flag. The change captures both control samples, aligns them with the data nibbles, and holds the error through the rest of the frame. It covers Spartan-6, 7-Series, UltraScale, GW5, ECP5 and Agilex, and includes two MAC fixes found through end-to-end tests. I completed this on top of an existing contributor's PR and kept their commit. It was merged into [LiteEth](https://github.com/enjoy-digital/liteeth/pull/233) on 28 September 2026.

**nextpnr: ECP5 global clocks.** Clock-only nets took the lowest global index and used up the eight globals that fabric-connected nets need. When that pool ran out, routing silently skipped the clock and still produced a bitstream with an unrouted clock. The fix allocates clock-only nets from the upper globals first, keeps fabric nets in the lower eight, and fails with a clear error when the pool is exhausted. It was checked on a full LFE5UM-85F design, with a hardware counter on a formerly stopped clock domain advancing again. The pull request is still [open](https://github.com/YosysHQ/nextpnr/pull/1822).

## Status

Sidermux is beta and pre-release, and breaking changes are expected between versions. The first crates are published on crates.io at 0.1.0. A bare-metal Rust Doom port for the same board, [de1-doom](https://github.com/VoidReg/de1-doom), has been started and has no code yet.

## Links

- HAL: [sidermux/sidermux-hal](https://github.com/sidermux/sidermux-hal)
- Firmware tools: [sidermux/sidermux-fwtools](https://github.com/sidermux/sidermux-fwtools)
- LiteEth change: [enjoy-digital/liteeth#233](https://github.com/enjoy-digital/liteeth/pull/233)
- nextpnr change: [YosysHQ/nextpnr#1822](https://github.com/YosysHQ/nextpnr/pull/1822)
