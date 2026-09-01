/** Minimal skills runtime: index -> full instructions -> additional files. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills");

// --------------------------------------------- LEVEL 1 — discovery and index
function parseFrontmatter(text) {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) return [{}, text];

  const metadata = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s+\S/.test(line) && currentKey) {
      metadata[currentKey] += ` ${line.trim()}`;
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    currentKey = line.slice(0, separator).trim();
    metadata[currentKey] = line.slice(separator + 1).trim();
  }
  return [metadata, match[2]];
}

export function discover_skills(root = SKILLS_DIR) {
  const skills = {};
  if (!existsSync(root)) return skills;

  const skillFolders = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const skillFolder of skillFolders) {
    const skillPath = join(root, skillFolder.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const [metadata, body] = parseFrontmatter(readFileSync(skillPath, "utf8"));

    const name = metadata.name || skillFolder.name;
    skills[name] = {
      description: metadata.description || "",
      dir: join(root, skillFolder.name),
      body: body.trim(),
    };
  }

  return skills;
}

export function render_index(skills) {
  if (Object.keys(skills).length === 0) return "";
  const lines = [
    "## Available skills",
    "",
    "Each entry describes a skill you can load with `load_skill`.",
    "",
  ];
  for (const [name, skill] of Object.entries(skills)) {
    lines.push(`- \`${name}\`: ${skill.description}`);
  }
  lines.push(
    "",
    "Rules:",
    "- If the task matches a skill description, call `load_skill` before answering.",
    "- Load only the skill you need, and load it once.",
    "- If no skill applies, respond normally."
  );
  return lines.join("\n");
}

// ------------------------------ LEVELS 2 AND 3 — load content on demand
export function load_skill(skills, skillName, loadedSkills) {
  const skill = skills[skillName];
  if (!skill) {
    return (
      `error: skill '${skillName}' was not found.\n` +
      `available skills: ${Object.keys(skills).join(", ") || "none"}\n` +
      "next step: use an exact skill name from the system prompt index."
    );
  }
  if (loadedSkills.has(skillName)) {
    return `already loaded: '${skillName}' is available earlier in the context. Continue with the task.`;
  }
  loadedSkills.add(skillName);
  return skill.body;
}

function listReferenceFiles(skill) {
  const referencesDir = join(skill.dir, "references");
  if (!existsSync(referencesDir)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile()) files.push(relative(skill.dir, filePath));
    }
  };
  visit(referencesDir);
  return files.sort();
}

function resolveSkillFilePath(skillDirectory, filePath) {
  const skillRoot = resolve(skillDirectory);
  const resolvedPath = resolve(skillRoot, filePath);
  const relativePath = relative(skillRoot, resolvedPath);
  const leavesSkillDirectory =
    relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
  return leavesSkillDirectory ? null : resolvedPath;
}

export function read_skill_file(skills, skillName, filePath) {
  const skill = skills[skillName];
  if (!skill) {
    return (
      `error: skill '${skillName}' was not found.\n` +
      `available skills: ${Object.keys(skills).join(", ") || "none"}\n` +
      "next step: use an exact skill name from the system prompt index."
    );
  }

  const resolvedPath = resolveSkillFilePath(skill.dir, filePath);
  if (!resolvedPath) {
    return "error: file path must stay inside the skill directory. Use a path relative to that directory.";
  }
  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    const availableFiles = listReferenceFiles(skill);
    return (
      `error: file '${filePath}' was not found in skill '${skillName}'.\n` +
      `available files: ${availableFiles.join(", ") || "none"}`
    );
  }
  return readFileSync(resolvedPath, "utf8");
}
