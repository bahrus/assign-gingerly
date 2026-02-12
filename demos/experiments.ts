import {BaseRegistry, IBaseRegistryItem} from '../types';

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

const regItem: IBaseRegistryItem<MyEnhancement> = {
    spawn: MyEnhancement,
    attrs: {
        base: 'greetings',
        howAreYou: '${base}:how-are-you',
        _hello: {
            mapsTo: 'howAreYou'
        }
    }
};