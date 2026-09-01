# Tools Workshop Agent

Agente usado en los workshops **02 — Tools** y **04 — Skills** de AI
Engineering.

Tiene un loop manual y cuatro tools:

- `search_web` y `notes` para el workshop de tools.
- `load_skill` y `read_skill_file` para mostrar progressive disclosure.

## Ejecutar

Requiere Node.js 20 o superior.

```bash
cp .env.example .env
```

Completá `OPENROUTER_API_KEY` y `PERPLEXITY_API_KEY`, y luego ejecutá:

```bash
npm start
```

Abrí [http://localhost:4317](http://localhost:4317).

## Probar las demos

Tools:

```text
Buscá 10 fuentes sobre diseño de tools. Si falla, reintentá sólo con el máximo que informe la tool.
```

Skills:

```text
¿Qué comen los patos azules y cuál es su código?
```

La segunda consulta carga primero la skill `patos` y después únicamente
`references/patos-azules.md`.

## Verificar

```bash
npm test
```

Material de las clases:
[AI Engineering Workshop](https://github.com/romanpcloudx/ai-engineering-workshop).
