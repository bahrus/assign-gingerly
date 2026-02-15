import {BaseRegistry, EnhancementConfig} from '../types';

class MyEnhancement {
    hello: string = '';
    wellBeing: boolean = false;
    howAreYou: string = '';
    
    constructor(
        private element?: Element,
        ctx?: any,
        initVals?: any
    ) {
        if (initVals) {
            // TypeScript knows initVals has { a?: string, b?: boolean }
            Object.assign(this, initVals);
        }
    }
}

const regItem: EnhancementConfig<MyEnhancement> = {
    spawn: MyEnhancement,
    withAttrs: {
        base: 'greetings',
        howAreYou: '${base}:how-are-you',
        _hello: {
            mapsTo: 'howAreYou'
        }
    }
};