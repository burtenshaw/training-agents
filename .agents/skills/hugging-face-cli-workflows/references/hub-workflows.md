# Hub Workflows

Common checks:

```bash
hf auth whoami
hf repo --help
hf upload --help
hf download --help
```

Use model repos for trained models and adapters, dataset repos for generated
training/eval data, and Spaces for dashboards or demos.

Artifact checklist:

- model or adapter weights
- tokenizer and chat template
- trainer config
- generation config
- eval script or command
- metrics
- README/model card notes

For private or sensitive work, create private repos and avoid public datasets
until licensing and data provenance are clear.
