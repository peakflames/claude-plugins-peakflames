#!/usr/bin/env node
import { main } from '../src/index.js';

process.exitCode = await main(process.argv.slice(2));
