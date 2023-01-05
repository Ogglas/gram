import { Pack, PackRegistrator } from "..";
import Model from "../../data/models/Model";
import { SuggestionResult, SuggestionSource } from "../../suggestions/models";
import { mapControls } from "./controls";
import { mapThreats } from "./threats";

export class ThreatLibSuggestionProvider implements SuggestionSource {
  slug: string = "threatlib";
  name: string = "threatlib";
  async suggest(model: Model): Promise<SuggestionResult> {
    const result: SuggestionResult = {
      threats: model.data.components
        .map((c) => mapThreats(model, c))
        .reduce((p, c) => [...p, ...c], []),
      controls: model.data.components
        .map((c) => mapControls(model, c))
        .reduce((p, c) => [...p, ...c], []),
    };

    return result;
  }
}

export class ThreatLibPack implements Pack {
  async bootstrap(reg: PackRegistrator) {
    reg.registerSuggestionSource(new ThreatLibSuggestionProvider());
  }
}