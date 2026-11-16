// electron-builder needs Node; Electron's bundled Node works when Node isn't installed.
const { build, Platform } = require("electron-builder");
process.noAsar = true; // Electron's fs treats .asar as folders; the builder needs raw files.

build({ targets: Platform.WINDOWS.createTarget(["nsis", "zip"]), publish: "never" })
  .then((files) => console.log(files.join("\n")))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
