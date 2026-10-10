# TreeScope

```JSON
{
    "id": "demo-0007",
    "flight_number": 7,
    "name": "Demo Mission 7",
    "date_utc": "2026-03-14T15:09:26.000Z",
    "upcoming": false,
    "success": true,
    "details": "Sample payload: a fictional crewed resupply flight used to demonstrate builtIns.itemscopeTree. All names and values are illustrative.",
    "patch": {
        "small": "./data/mission-patch.svg",
        "alt": "Demo Mission 7 patch"
    },
    "rocket": {
        "name": "Falcon 9",
        "type": "rocket",
        "active": true,
        "stages": 2,
        "height": { "meters": 70, "feet": 229.6 },
        "mass": { "kg": 549054, "lb": 1207920 },
        "engines": {
            "number": 9,
            "type": "merlin",
            "version": "1D+",
            "propellant_1": "liquid oxygen",
            "propellant_2": "RP-1 kerosene"
        }
    },
    "crew": [
        { "name": "Avery Quinn", "role": "Commander", "agency": "Example Space Agency" },
        { "name": "Rowan Okafor", "role": "Pilot", "agency": "Example Space Agency" },
        { "name": "Mika Laine", "role": "Mission Specialist", "agency": "Demo Orbital Institute" }
    ],
    "cores": [
        {
            "serial": "B9007",
            "flight": 4,
            "reused": true,
            "landing_attempt": true,
            "landing_success": true,
            "landing_type": "ASDS"
        }
    ],
    "failures": [],
    "links": {
        "webcast": "https://example.com/webcast/demo-mission-7",
        "article": "https://example.com/articles/demo-mission-7",
        "wikipedia": null
    }
}
```

```JS
class HElement {
    static attrs = {};
    static children = [];
    static a(name, value){
        this.attrs[name] = value;
        return this;
    }
    static c(children){
        this.children = [...this.children, ...children];
    }
}

class Div extends HElement{
    static tag = 'div';
}

class TextInput extends HElement {
    static tag = 'input';
    static attrs = {type: 'text'}
}

class Img extends HElement {
    static tag = 'img';
}

class Patch extends Img {
    
}
```