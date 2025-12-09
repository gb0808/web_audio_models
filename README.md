# web-audio
## Installation
First, install the web-audio following:
- [NodeJS](https://nodejs.org/en/) (LTS recommended)
- [MongoDB](https://www.mongodb.com/)

Second, start mongodb locally by running the `mongod` executable in your mongodb installation (you may need to create a `data` directory or set `--dbpath`).

Then, run `webgme start` from the project root to start . Finally, navigate to `http://localhost:8888` to start using web-audio!

## Description
Web Audio Studio is a modeling language for designing custom audio effects. To start, define an `AudioGraph` inside of an `AudioStudio` object. From there, you can use a number of `AudioNodes` to define the desired audio effect.

The meta model can be found under `src/exports/meta-model-final.webgmex`.