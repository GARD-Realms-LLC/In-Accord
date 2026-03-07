const fs = require("fs");
const path = require("path");
const pngToIcoModule = require("png-to-ico");
const pngToIco = pngToIcoModule.default || pngToIcoModule;

function readPngDimensions(filePath) {
  const file = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (file.length < 24 || file.subarray(0, 8).toString("hex") !== pngSignature) {
    return null;
  }

  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  return { width, height };
}

function isValidIcoBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 6) {
    return false;
  }

  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  const count = buffer.readUInt16LE(4);

  if (reserved !== 0 || type !== 1 || count < 1) {
    return false;
  }

  const directoryLength = 6 + count * 16;
  if (buffer.length < directoryLength) {
    return false;
  }

  for (let i = 0; i < count; i += 1) {
    const entryOffset = 6 + i * 16;
    const bytesInRes = buffer.readUInt32LE(entryOffset + 8);
    const imageOffset = buffer.readUInt32LE(entryOffset + 12);
    if (bytesInRes < 1 || imageOffset < directoryLength) {
      return false;
    }
    if (imageOffset + bytesInRes > buffer.length) {
      return false;
    }
  }

  return true;
}

async function main() {
  const workspaceRoot = path.join(__dirname, "..");
  const imagesDir = path.join(workspaceRoot, "Images");
  const outputIconPath = path.join(imagesDir, "app-icon.ico");
  const fallbackIconPath = path.join(imagesDir, "fav.ico");

  const pngCandidates = [
    "in-accord-steampunk-favicon.png",
    "in-accord-steampunk-logo-512.png",
    "in-accord-steampunk-logo-icon.png",
    "in-accord-steampunk-logo-mono.png",
    "in-accord-steampunk-logo.png",
  ]
    .map((fileName) => path.join(imagesDir, fileName))
    .filter((filePath) => fs.existsSync(filePath))
    .filter((filePath) => {
      const dimensions = readPngDimensions(filePath);
      return (
        dimensions !== null &&
        dimensions.width === dimensions.height &&
        dimensions.width <= 256 &&
        dimensions.height <= 256
      );
    });

  if (pngCandidates.length > 0) {
    const candidateSets = [pngCandidates, ...pngCandidates.map((filePath) => [filePath])];

    for (const sourceSet of candidateSets) {
      try {
        const iconBuffer = await pngToIco(sourceSet);
        if (!isValidIcoBuffer(iconBuffer)) {
          continue;
        }
        fs.writeFileSync(outputIconPath, iconBuffer);
        console.log(
          `Generated Windows icon from ${sourceSet.length} source image(s): ${path.relative(workspaceRoot, outputIconPath)}`,
        );
        return;
      } catch (_error) {
        // Try the next source set.
      }
    }
  }

  if (fs.existsSync(fallbackIconPath)) {
    fs.copyFileSync(fallbackIconPath, outputIconPath);
    console.log(
      `PNG icon sources not found, copied fallback icon: ${path.relative(workspaceRoot, outputIconPath)}`,
    );
    return;
  }

  throw new Error(
    "Could not generate app-icon.ico because no PNG sources were found and fallback Images/fav.ico is missing.",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[generate-windows-icon] ${message}`);
  process.exit(1);
});
