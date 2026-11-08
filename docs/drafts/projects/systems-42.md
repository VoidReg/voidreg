---
slug: systems-42
title: Systems programming at 42
category: Systems programming
summary: Early systems work from the 42 curriculum: a wireframe renderer in C, ten C++ modules, a containerized web stack, and team projects in C and C++.
tags: [c, cpp, systems, graphics, docker, 42]
repo_url: https://github.com/VoidReg/FdF
featured: false
sort_order: 60
related: []
---

## What it is

A group of projects from the 42 curriculum, picked because they show the low-level habits the rest of my work depends on: memory ownership, reading specifications, and building the thing instead of importing it.

## FdF: a wireframe renderer in C

FdF reads a height map, a grid of altitudes, and draws it as a wire mesh using the 42 MinilibX library. It started as the mandatory isometric view and then grew to cover every bonus: zoom, translation, node colors, rotation and an orthographic projection. Rotation is plain rotation matrices, and lines are drawn with the DDA algorithm. Heavier maps show both projections holding up.

[Source](https://github.com/VoidReg/FdF)

## CPP Modules: object-oriented C++ from first principles

Ten modules, CPP00 to CPP09, each focused on one idea:

- Classes, namespaces and streams, then `new` and `delete`, pointers and references.
- The orthodox canonical class form, with a fixed-point number type of the sort used on older hardware to save memory.
- Inheritance, subtype polymorphism, abstract classes and interfaces.
- Exceptions, safe casting, templates, and STL containers with iterators and algorithms.
- A final module that combines everything. Each exercise needs at least one STL container, and a container cannot be reused in a later exercise.

[Source](https://github.com/VoidReg/CPP-Modules)

## Inception: a small web stack in containers

A multi-service stack built from Dockerfiles, with nginx, MariaDB, WordPress and Redis, TLS certificates generated with OpenSSL, and health checks. The repository keeps the reading list behind it: container init processes, service health checks, and nginx as a reverse proxy.

[Source](https://github.com/VoidReg/inception)

## Team projects

- **webserv**: an HTTP server in C++, built with a team in the LinuxHeads group. [Source](https://github.com/LinuxHeads/webserv_42)
- **miniAB**: a ray tracer in C, built with a partner team, with the mandatory part complete and most of the bonus done. [Source](https://github.com/42Proton/miniAB)

## Status

Finished coursework, kept as reference. Related current work: the graphics in [Rotex](/projects/rotex) and the bare-metal code in [Sidermux](/projects/sidermux).
