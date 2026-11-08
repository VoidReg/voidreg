---
slug: rotex
title: Rotex
category: Graphics and engines
summary: A modular Rust graphics engine built around one small rendering API. Backends for Vulkan, wgpu and Direct3D 12 translate the same command lists, and every feature says whether it is native, emulated or absent.
tags: [rust, graphics, vulkan, wgpu, direct3d12, rhi, shaders]
repo_url: https://github.com/rotex-labs/rotex-core
featured: false
sort_order: 40
related: []
---

## What it is

Rotex is a graphics engine for Rust, built from small crates. Its core is a hardware interface (an RHI): you record a list of explicit commands, and a backend translates that list for a specific graphics API. The same command list runs on Vulkan, wgpu and Direct3D 12, and an OpenGL ES 3 and WebGL2 backend is in progress.

## The design in three ideas

**One vocabulary, thin backends.** `rotex-types` defines handles, descriptors and the `RhiCommand` list, and imports no GPU API. Each backend is a stateless translator. It does not own scene state and does not insert barriers you did not ask for.

**Capabilities are explicit.** Every feature reports Native, Emulated or Absent for each backend, so nothing fails silently. Core features behave the same everywhere. Extensions such as indirect draws are opt-in at compile time through a `Supports<Feature>` trait.

**Passes and emulation are separate crates.** `rotex-graph` reads the passes you declared and splices barriers where the resource state changes. `rotex-emulation` can rewrite a command list for a backend that lacks a feature. For example, missing push constants become a buffer write.

## The crates

| Crate | Role |
| --- | --- |
| `rotex-types` | Handles, descriptors, command lists and the capability model |
| `rotex-core` | `GpuBackend`, `GpuPlatform` and a thin graphics context |
| `rotex-conformance` | Checks a backend's behavior against the capabilities it reports |
| `rotex-graph` | Declared pass usage becomes barrier commands |
| `rotex-emulation` | Optional command-list rewrite before execution |
| `rotex-vulkan`, `rotex-wgpu`, `rotex-d3d12`, `rotex-gl` | Backends |
| `rotex-shader` | One shader source reflected into WGSL, MSL, GLSL and HLSL |
| `rotex-ext-indirect` | Indexed indirect draw, and the pattern for later extensions |
| `rotex-window`, `rotex-math` | Window abstraction and math and color types |

Shaders are cooked ahead of time. The cooker reflects a single naga module into every backend's format, so backends load payloads and never compile source. Keeping that out of the hardware interface also keeps the shader compiler out of the core build.

A conformance crate sits outside the core on purpose. It runs the same behavior checks against every backend, such as duplicate resource creation returning an error, or a cleared texture reading back correctly when render-to-texture and readback are native.

## Status

Beta and pre-1.0. APIs and crate boundaries can change in any 0.x release, and the project says so in every README. The core crates are published on crates.io. The crates are licensed under Apache-2.0 or MIT. "Zero cost" (static dispatch and no per-command allocation) is the design goal. It is being worked toward and is not yet claimed as shipped.

## Links

- Core: [rotex-labs/rotex-core](https://github.com/rotex-labs/rotex-core)
- Backends: [rotex-vulkan](https://github.com/rotex-labs/rotex-vulkan), [rotex-wgpu](https://github.com/rotex-labs/rotex-wgpu), [rotex-d3d12](https://github.com/rotex-labs/rotex-d3d12), [rotex-gl](https://github.com/rotex-labs/rotex-gl)
- Shaders: [rotex-shader](https://github.com/rotex-labs/rotex-shader)
- Organization: [rotex-labs](https://github.com/rotex-labs)
