import { defineRenderer } from '../kit';
import { lowerSchematic } from './static';

export default defineRenderer({
  type: 'voidreg:schematic',
  module: 'voidreg:schematic',
  entry: {
    interactive: { module: 'voidreg:schematic' },
    static: { module: 'voidreg:schematic-static', lower: lowerSchematic }
  }
});
