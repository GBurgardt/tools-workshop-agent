# Tools Workshop Agent

Agente nuevo y separado de `broker-agent`, preparado para workshops de tools y skills. Usa Node.js, OpenRouter y un loop manual `tool call → tool result → siguiente decisión del modelo`.

El catálogo del padre contiene cinco tools con el mismo contrato `definition + execute` y un
único dispatcher. Dos son las capacidades que ya existían:

- `search_web`: búsqueda web real mediante Perplexity Search API.
- `notes`: una sola tool de notas con acciones `save`, `list`, `search` y `delete`.

Las otras dos son tools de conocimiento para el workshop de skills: `load_skill` y
`read_skill_file`. Cargan texto bajo demanda sin cambiar las capacidades anteriores.

La quinta, `run_subagent`, delega un encargo a `researcher`. El investigador usa el mismo
loop, pero con historial nuevo, instrucciones propias y sólo `search_web`.

## Mostrar subagentes

Escribí: `Delegá a researcher una investigación breve sobre energía nuclear. Que busque en la web y devuelva dos fuentes. Después resumime sus hallazgos.`

1. `src/subagent.js`: contrato `run_subagent({ agent, task })`, validación del tipo y tools del hijo.
2. En ese mismo archivo, `runSubagent` crea un historial nuevo y llama a `runAgentLoop`.
3. `src/agent-loop.js`: el loop compartido ejecuta las búsquedas y devuelve el informe.
4. `src/agent.js`: el padre tiene las cuatro tools anteriores más `run_subagent`.

El padre espera el informe. Sólo ese texto entra a su contexto, no las búsquedas intermedias.
La interfaz muestra `researcher · search_web` por separado; los outputs siguen cerrados por defecto.
El hijo tiene un máximo de ocho llamadas al modelo, sin recursión, forks ni background.
Las credenciales y el modelo son los mismos que ya usa el agente.

## Levantar el chat

Primera instalación:

```bash
npm install
```

Comando exacto para levantarlo:

```bash
npm start
```

Abrí [http://localhost:4317](http://localhost:4317). El servidor escucha sólo en `127.0.0.1`. DeepSeek V4 Flash es el modelo inicial y el selector permite cambiar a Claude Sonnet; ambos pasan por OpenRouter. Al cambiar de modelo se abre una conversación limpia.

Configurá `OPENROUTER_API_KEY` y `PERPLEXITY_API_KEY` en `.env`. El proyecto también puede leerlas desde `../broker-agent/.env` como fallback local de sólo lectura. Para usar el agente en otro lugar, copiá `.env.example` a `.env` y completá ambas keys.

## Verificar

```bash
npm test
curl http://localhost:4317/api/health
```

La respuesta de health debe declarar `"tool_count":5`: `search_web`, `notes`, `load_skill`,
`read_skill_file` y `run_subagent`.

## Mostrar progressive disclosure

1. `¿Cómo responden sobre patos en este workshop?` carga solamente la skill `patos`.
2. `¿Qué comen los patos azules y cuál es su código?` carga `patos` y después sólo
   `references/patos-azules.md`.
3. `¿Cuánto es 2 + 2?` no carga ninguna skill.

## Comparar una tool mala y una buena

La comparación didáctica de errores sigue disponible como demo offline y no modifica la
`search_web` real de la interfaz:

Pide 25 resultados a un proveedor cuyo máximo es 6. Ambas variantes comparten prompt, schema y ejecución; sólo cambia el error devuelto por `search_web` cuando se excede el límite:

```bash
npm test -- tool-design-comparison
```

También podés ejecutar cada mitad por separado:

```bash
npm run demo:tool-bad
npm run demo:tool-good
```

Las llamadas y sus retornos aparecen tanto dentro de la conversación como en la traza lateral. Mientras el agente procesa se muestra un indicador de actividad; los errores estructurados aparecen parseados en filas legibles. El botón `+` abre una conversación limpia.
