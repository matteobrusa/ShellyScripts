/*
 * This scripts uses the built-in LED of the Shelly plug to show the current power 
 * production or consumption by changing the hue (color) of the LED. 
 * off -> blue -> green -> yellow -> red (100%) -> magenta (125%)
 * Set the MAX_POWER const to calibrate the range of the expected power consumption.
 */

const MAX_POWER= 650;

// set the LED's color
function rgb(red, green, blue) {
  let config = {
      "config": {
          "leds": {
              "colors": {
                  "switch:0": {
                      "on": {
                          "rgb": [red, green, blue],
                          "brightness": 100
                      }
                  }
              }
          }
      }
  };
  
  Shelly.call("PLUGS_UI.SetConfig", config);
}

// convert HSV to RGB
function hsvToRgb(h, s, v) {
  var r, g, b;

  var i = Math.floor(h * 6);
  var f = h * 6 - i;
  var p = v * (1 - s);
  var q = v * (1 - f * s);
  var t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }

  return [ r * 100, g * 100, b * 100 ];
}

// set the LED's color IN HSV values
function hsv(h, s, v) {
  let c= hsvToRgb(h, s, v)
//  print (c[0],c[1], c[2]);
  rgb (c[0],c[1], c[2]);
}

function clamp(num, max) {  
  return num <= 0 ? 0 : num >= max  ? max  : num
}

/////////////////////////
//
// main()
//
/////////////////////////

let lastPower= -100;

// blink white
//rgb(100,100,100);
//sleep(100);
//rgb(14,11,10);

print("PowerLED start");


// continuously update the LED color 
Timer.set( 1000, true, function() {
  Shelly.call(
    "switch.getStatus",
    { id: 0 },
    function (res, error_code, error_msg, ud) {
      let power= res.apower;

 
      // only on a significant change
      if (Math.abs(power - lastPower) > 10) {
        lastPower= power;
        
        // treat production as consumption
        if (power < 0) power= -power;
        
        let p= clamp(power / MAX_POWER*4/6, 5/6  );
        let hue= (1+ 4/6-p) % 1  ;
        hsv(hue, 1, 1);
        print("PowerLED power: " + power + "W "+ Math.floor(power*100/MAX_POWER) + "% of " + MAX_POWER + "W hue: " + Math.floor(hue*360)+"°");
       }
    },
    null
  );
});
