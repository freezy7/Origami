import {FreePaper,Crease} from '../../assets/scripts/core/FreePaper';
// Exact four-step recipe exported from the user's blocked-corner case.
const steps:{crease:Crease;uv:[number,number];angle:number;all:boolean}[]=[
  {
    "crease": {
      "a": [
        0,
        0.04412112090187674,
        0
      ],
      "b": [
        -0.0003733376546897121,
        -0.1558785306453087,
        0
      ],
      "normal": [
        0,
        0,
        1
      ]
    },
    "uv": [
      0.105,
      0.043925118291676335
    ],
    "angle": 0,
    "all": false
  },
  {
    "crease": {
      "a": [
        0.0524996023059116,
        0.0960975128836679,
        0
      ],
      "b": [
        0.1937889020937265,
        -0.045455776606435336,
        0
      ],
      "normal": [
        0,
        0,
        1
      ]
    },
    "uv": [
      0.105,
      0.1485
    ],
    "angle": 3.141592653589793,
    "all": false
  },
  {
    "crease": {
      "a": [
        -0.052500761405547276,
        0.09590267005405972,
        0
      ],
      "b": [
        0.08905252808455597,
        0.2371919698418746,
        0
      ],
      "normal": [
        0,
        0,
        1
      ]
    },
    "uv": [
      -0.105,
      0.1485
    ],
    "angle": 3.141592653589793,
    "all": false
  },
  {
    "crease": {
      "a": [
        -2.491939336728404e-05,
        0.03077162366359598,
        4.2488471045215345e-34
      ],
      "b": [
        -0.2000245709405527,
        0.03114496131828571,
        -1.7335278288283362e-17
      ],
      "normal": [
        8.651474436945917e-17,
        -8.667639144141682e-17,
        -1
      ]
    },
    "uv": [
      0.00019484316907641963,
      0.1485
    ],
    "angle": 3.141592653589793,
    "all": false
  }
];
export function coveredCornersFixture():FreePaper{
 const p=new FreePaper();for(const r of steps){p.setCrease(r.crease.a,r.crease.b,r.crease.normal);p.begin(r.uv,r.all);p.preview(r.angle===0?Math.PI:r.angle);p.finish();if(r.angle===0)p.preview(0);}return p;
}
