import { sanitizeStorageFilename } from "@/lib/documentos/storage-paths";

/**
 * Splits a filename into its stem and extension, treating only the LAST dot as
 * the extension boundary — so `informe.tar.gz` yields `informe.tar` + `.gz` and
 * a de-duplication suffix cannot land after the extension and break the file's
 * association.
 */
function splitExtension(name: string): { stem: string; extension: string } {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) {
    return { stem: name, extension: "" };
  }
  return { stem: name.slice(0, lastDot), extension: name.slice(lastDot) };
}

/**
 * Assigns a unique zip entry name to every selected file, in order (task 6.4,
 * spec document-zip-export "Zip entry naming avoids collisions").
 *
 * `original_filename` is not unique across documents — two clientes' `acta.pdf`
 * are a perfectly normal selection — and a zip with two identical entry names
 * silently loses one on extraction in most tools. Repeats therefore get a
 * ` (n)` suffix inserted before the extension.
 *
 * The generated name is itself checked against everything already taken, so a
 * selection that genuinely contains `acta.pdf`, `acta (2).pdf` and a second
 * `acta.pdf` still produces three distinct entries rather than colliding on the
 * naive suffix. Names are sanitized with `sanitizeStorageFilename` first, which
 * strips path separators — an entry named `../../etc/passwd` would otherwise
 * write outside the extraction root in tools that trust archive paths.
 */
export function buildZipEntryNames(originalFilenames: string[]): string[] {
  const taken = new Set<string>();

  return originalFilenames.map((original) => {
    const sanitized = sanitizeStorageFilename(original);
    if (!taken.has(sanitized)) {
      taken.add(sanitized);
      return sanitized;
    }

    const { stem, extension } = splitExtension(sanitized);
    let counter = 2;
    let candidate = `${stem} (${counter})${extension}`;
    while (taken.has(candidate)) {
      counter += 1;
      candidate = `${stem} (${counter})${extension}`;
    }
    taken.add(candidate);
    return candidate;
  });
}
