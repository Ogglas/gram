import { join } from "path";
import { Plugin, PluginRegistrator } from "@gram/core/dist/plugin";
import { ComponentClass } from "@gram/core/dist/data/component-classes";
import classes from "./classes.json";

const toComponentClass = (c: any): ComponentClass => {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    componentType: c.componentType,
  };
};

export default class SVGPornPlugin implements Plugin {
  async bootstrap(reg: PluginRegistrator): Promise<void> {
    reg.registerAssets("svgporn", join(__dirname, "logos"));
    reg.registerComponentClasses(classes.map((c) => toComponentClass(c)));
  }
}
