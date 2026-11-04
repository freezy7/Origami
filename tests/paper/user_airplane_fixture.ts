import {FreePaper, Crease} from '../../assets/scripts/core/FreePaper';

/** Recorded user recipe, including the reverse nose fold that traps the two
 * first corner flaps. Coordinates come from the UI export, not an ideal plane.
 * The export contains final fold angles, not the original force/time history. */
export const USER_AIRPLANE_STEPS: {crease:Crease;grip:[number,number];angle:number;allLayers:boolean}[] = [
  {
    "crease": {
      "a": [
        0,
        0.007444365804564396,
        0
      ],
      "b": [
        -0.000583116398164587,
        -0.19255478413179458,
        0
      ],
      "normal": [
        0,
        0,
        1
      ]
    },
    "grip": [
      0.105,
      0.00713822839434658
    ],
    "angle": 0,
    "allLayers": false
  },
  {
    "crease": {
      "a": [
        0.05255316198546312,
        0.09620585277508792,
        0
      ],
      "b": [
        0.19376820495250519,
        -0.045421516189446814,
        0
      ],
      "normal": [
        0,
        0,
        1
      ]
    },
    "grip": [
      0.105,
      0.1485
    ],
    "angle": 3.141592653589793,
    "allLayers": false
  },
  {
    "crease": {
      "a": [
        -0.052448037079745026,
        0.09579459350832362,
        0
      ],
      "b": [
        0.08917933188478974,
        0.23700963647536571,
        0
      ],
      "normal": [
        0,
        0,
        1
      ]
    },
    "grip": [
      -0.105,
      0.1485
    ],
    "angle": 3.141592653589793,
    "allLayers": false
  },
  {
    "crease": {
      "a": [
        8.005401507912366e-05,
        0.03490155105130512,
        8.497694209043069e-34
      ],
      "b": [
        -0.19991909592127982,
        0.035484667449469716,
        -1.7344350407407866e-17
      ],
      "normal": [
        8.646927518052202e-17,
        -8.672175203703935e-17,
        -1
      ]
    },
    "grip": [
      0.0004112610147544993,
      0.1485
    ],
    "angle": -3.141592653589793,
    "allLayers": false
  },
  {
    "crease": {
      "a": [
        0.05238707500494899,
        -0.017711373943745872,
        2.3733788586142986e-33
      ],
      "b": [
        -0.08862135458723228,
        0.12412170676716187,
        -1.7319121124709864e-17
      ],
      "normal": [
        -3.5705581527131204e-19,
        -1.224641594008768e-16,
        -1
      ]
    },
    "grip": [
      0.105,
      0.03459564704612403
    ],
    "angle": 3.141592653589793,
    "allLayers": false
  },
  {
    "crease": {
      "a": [
        -0.05261315840008768,
        -0.017485290548607164,
        6.434324938118303e-18
      ],
      "b": [
        -0.1944462391109954,
        -0.1584937201407884,
        2.375344606282817e-17
      ],
      "normal": [
        -3.5705581527129736e-19,
        -1.224641594008768e-16,
        -1
      ]
    },
    "grip": [
      -0.105,
      0.03520792186655965
    ],
    "angle": 3.141592653589793,
    "allLayers": false
  },
  {
    "crease": {
      "a": [
        0.00020084182038260234,
        -0.08736622916702151,
        0
      ],
      "b": [
        -0.0009696286077539812,
        0.1126303458010935,
        0
      ],
      "normal": [
        0,
        0,
        1
      ]
    },
    "grip": [
      -0.10459831635923479,
      -0.08797956124814543
    ],
    "angle": 2.7838001569309556,
    "allLayers": false
  },
  {
    "crease": {
      "a": [
        0.05267859137410592,
        -0.09235598371586552,
        9.328510299218344e-18
      ],
      "b": [
        0.12937120387198198,
        -0.2770672264387995,
        9.328510299218344e-18
      ],
      "normal": [
        0,
        0,
        1
      ]
    },
    "grip": [
      0.105,
      -0.07063199194397482
    ],
    "angle": -2.4958208303518914,
    "allLayers": false
  },
  {
    "crease": {
      "a": [
        0.049769331886899436,
        -0.0906642659235932,
        0.018525365192143043
      ],
      "b": [
        0.12361221595358068,
        -0.2745312445917382,
        0.04573129521047879
      ],
      "normal": [
        -0.3502013839022317,
        -0.0020495369173968944,
        0.9366721892483976
      ]
    },
    "grip": [
      -0.105,
      -0.0695675426457365
    ],
    "angle": 1.9373154697137058,
    "allLayers": false
  }
];

export function userAirplaneFixture():FreePaper {
  const paper=new FreePaper();
  for(const step of USER_AIRPLANE_STEPS) {
    paper.setCrease(step.crease.a,step.crease.b,step.crease.normal);
    paper.begin(step.grip,step.allLayers);
    paper.preview(step.angle===0?Math.PI:step.angle);paper.finish();
    if(step.angle===0)paper.preview(0);
  }
  return paper;
}
