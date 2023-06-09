type LabColor = {
  l: number;
  a: number;
  b: number;
};

type Vector = {
  x: number;
  y: number;
};

type Center = {
  x: number;
  y: number;
  l: number;
  a: number;
  b: number;

  c: number;
};

export default class SLIC {
  private width: number;
  private height: number;
  private rgbImage: Uint8ClampedArray;
  private imageArray: number[];
  private centers: Center[];

  private step: number;
  private iters: number;
  private stride: number;
  private weight: number;

  private clusterID: number[];

  constructor(imageArray: Uint8ClampedArray, width: number, height: number) {
    this.rgbImage = imageArray;
    this.imageArray = Array.from(imageArray);
    this.width = width;
    this.height = height;

    console.log('Total pixel :', this.width * this.height);
    console.log('width :', width);
    console.log('height: ', height);
  }

  rgb2lab(sR: number, sG: number, sB: number): LabColor {
    // rgb2xyz
    const R: number = sR / 255;
    const G: number = sG / 255;
    const B: number = sB / 255;

    let r: number;
    let g: number;
    let b: number;

    if (R <= 0.04045) {
      r = R / 12.92;
    } else {
      r = Math.pow((R + 0.055) / 1.055, 2.4);
    }
    if (G <= 0.04045) {
      g = G / 12.92;
    } else {
      g = Math.pow((G + 0.055) / 1.055, 2.4);
    }
    if (B <= 0.04045) {
      b = B / 12.92;
    } else {
      b = Math.pow((B + 0.055) / 1.055, 2.4);
    }

    let X: number;
    let Y: number;
    let Z: number;

    X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    Y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
    Z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

    // xyz2lab
    let epsilon = 0.008856; // actual CIE standard
    let kappa = 903.3; // actual CIE standard

    let Xr = 0.950456; // reference white
    let Yr = 1.0; // reference white
    let Zr = 1.088754; // reference white
    let xr = X / Xr;
    let yr = Y / Yr;
    let zr = Z / Zr;

    let fx: number;
    let fy: number;
    let fz: number;

    if (xr > epsilon) {
      fx = Math.pow(xr, 1.0 / 3.0);
    } else {
      fx = (kappa * xr + 16.0) / 116.0;
    }
    if (yr > epsilon) {
      fy = Math.pow(yr, 1.0 / 3.0);
    } else {
      fy = (kappa * yr + 16.0) / 116.0;
    }
    if (zr > epsilon) {
      fz = Math.pow(zr, 1.0 / 3.0);
    } else {
      fz = (kappa * zr + 16.0) / 116.0;
    }

    const lValue: number = 116.0 * fy - 16.0;
    const aValue: number = 500.0 * (fx - fy);
    const bValue: number = 200.0 * (fy - fz);

    return { l: lValue, a: aValue, b: bValue };
  }

  // Not used
  // lab2rgb(sL: number, sA: number, sB: number) {}

  findLocalMinimum(hPos: number, wPos: number): Vector {
    let minGrad: number = Number.MAX_VALUE;
    let locMin: Vector = { x: 0, y: 0 };

    let i: number;
    let j: number;

    for (i = hPos - 1; i <= hPos + 1 && i >= 0 && i < this.height - 1; i++) {
      for (j = wPos - 1; j <= wPos + 1 && j >= 0 && j < this.width - 1; j++) {
        let i1 = this.imageArray[4 * (i * this.width + j + 1)]; //right pixel
        let i2 = this.imageArray[4 * ((i + 1) * this.width + j + 1)]; // bottom pixel
        let i3 = this.imageArray[4 * (i * this.width + j)]; // self

        if (Math.sqrt(Math.pow(i1 - i3, 2)) + Math.sqrt(Math.pow(i2 - i3, 2)) < minGrad) {
          minGrad = Math.abs(i1 - i3) + Math.abs(i2 - i3);
          locMin.x = i;
          locMin.y = j;
        }
      }
    }

    return locMin;
  }

  computeDist(centerPos: number, pixX: number, pixY: number): number {
    // if(pixX <=2)
    // console.log(pixX, pixY)

    const center = this.centers[centerPos];
    // let v1=Math.pow(center.l - this.image[pixX][pixY][0],2)
    // let v2=Math.pow(center.a - this.image[pixX][pixY][1],2)
    // let v3=Math.pow(center.b - this.image[pixX][pixY][2],2)

    // let temp=(Math.pow(center.l - this.image[pixX][pixY][0],2) + Math.pow(center.a - this.image[pixX][pixY][1],2)+ Math.pow(center.b - this.image[pixX][pixY][2],2))

    const dc: number = Math.sqrt(
      Math.pow(center.l - this.imageArray[4 * (pixX * this.width + pixY)], 2) +
        Math.pow(center.a - this.imageArray[4 * (pixX * this.width + pixY) + 1], 2) +
        Math.pow(center.b - this.imageArray[4 * (pixX * this.width + pixY) + 2], 2),
    );
    const ds: number = Math.sqrt(Math.pow(center.x - pixX, 2) + Math.pow(center.y - pixY, 2));

    return Math.pow(dc / this.weight, 2) + Math.pow(ds / this.step, 2);
  }

  computePixel() {
    console.log('computing.............................');
    // Initialize cluster centers by sampling pixels at regular grid step
    this.clusterID = Array.from({ length: this.width * this.height }).map(() => -1);
    this.centers = [];

    for (let i = this.step; i < this.height; i += this.step) {
      for (let j = this.step; j < this.width; j += this.step) {
        let vector = this.findLocalMinimum(i, j);

        const center: Center = {
          x: vector.x,
          y: vector.y,
          l: this.imageArray[4 * (vector.x * this.width + vector.y)],
          a: this.imageArray[4 * (vector.x * this.width + vector.y) + 1],
          b: this.imageArray[4 * (vector.x * this.width + vector.y) + 2],

          // TODO check
          c: 0,
        };

        this.centers.push(center);
      }
    }

    let i: number;
    let j: number;
    let m: number;
    let n: number;
    let k: number;

    // Iterations
    for (i = 0; i < this.iters; i++) {
      // Minimum distance to centers
      let distances = Array.from({ length: this.width * this.height }).map(
        (item) => (item = Number.MAX_VALUE),
      );

      for (j = 0; j < this.centers.length; j++) {
        for (m = this.centers[j].x - this.step; m < this.centers[j].x + this.step; m++) {
          for (n = this.centers[j].y - this.step; n < this.centers[j].y + this.step; n++) {
            if (m >= 0 && m < this.height && n >= 0 && n < this.width) {
              const d: number = this.computeDist(j, m, n);

              if (d < distances[m * this.width + n]) {
                distances[m * this.width + n] = d;
                this.clusterID[m * this.width + n] = j;
              }
            }
          }
        }
      }

      const oldCenters = JSON.parse(JSON.stringify(this.centers));

      // Clear old values
      this.centers.forEach((center) => {
        center.x = 0;
        center.y = 0;
        center.l = 0;
        center.a = 0;
        center.b = 0;
        center.c = 0;
      });

      // Compute new cluster centers
      for (j = 0; j < this.height; j++)
        for (k = 0; k < this.width; k++) {
          const c: number = this.clusterID[j * this.width + k];

          if (c !== -1) {
            this.centers[c].l += this.imageArray[4 * (j * this.width + k)];
            this.centers[c].a += this.imageArray[4 * (j * this.width + k) + 1];
            this.centers[c].b += this.imageArray[4 * (j * this.width + k) + 2];
            this.centers[c].x += j;
            this.centers[c].y += k;
            this.centers[c].c += 1;
          }
        }

      for (var index in this.centers) {
        if (
          this.centers[index].c == 0 ||
          this.centers[index].x == undefined ||
          this.centers[index].y == undefined
        ) {
          // this.centers[index]= JSON.parse(JSON.stringify(oldcenters[index]))
          //    console.log("--")
          // console.log(index,this.centers[index].c,this.centers[index].x,this.centers[index].y)
          this.centers[index] = JSON.parse(JSON.stringify(oldCenters[index]));
          // console.log(index,this.centers[index].c,this.centers[index].x,this.centers[index].y)

          // TODO ----- check if I need this
          // let canvas = document.getElementById('canvas');
          // let context = canvas.getContext('2d');
          // context.fillRect(this.centers[index].y, this.centers[index].x, 10, 10);
        } else {
          this.centers[index].l /= this.centers[index].c;
          this.centers[index].a /= this.centers[index].c;
          this.centers[index].b /= this.centers[index].c;
          this.centers[index].x = Math.floor(this.centers[index].x / this.centers[index].c);
          this.centers[index].y = Math.floor(this.centers[index].y / this.centers[index].c);
        }
      }
    }
    console.log('compute done.............................');
  }

  pickPixel() {
    console.log('painting...................');
    // pick pixel
    let row: number = Math.ceil(this.height / this.stride);
    let col: number = Math.ceil(this.width / this.stride);
    let resultImage: Uint8ClampedArray = new Uint8ClampedArray(this.width * this.height * 4);

    let m: number;
    let n: number;
    let j: number;
    let k: number;

    // iteration for every pix rectangle
    for (m = 0; m < row; m++) {
      for (n = 0; n < col; n++) {
        const startJ: number = m * this.stride;
        const startK: number = n * this.stride;
        const counts: Record<number, number> = {};

        for (j = startJ; j < startJ + this.stride && j < this.height; j++) {
          for (k = startK; k < startK + this.stride && k < this.width; k++) {
            const c: number = this.clusterID[j * this.width + k];

            if (c != -1) {
              if (counts[c]) {
                counts[c]++;
              } else {
                counts[c] = 1;
              }
            }
          }
        }
        let centerPos: number = -1;
        let max = Number.MIN_VALUE;

        for (let pos in counts) {
          if (counts[pos] > max) {
            max = counts[pos];
            centerPos = parseInt(pos, 10);
          }
        }

        for (j = startJ; j < startJ + this.stride && j < this.height; j++) {
          for (k = startK; k < startK + this.stride && k < this.width; k++) {
            resultImage[4 * (j * this.width + k)] =
              this.rgbImage[
                4 * (this.centers[centerPos].x * this.width + this.centers[centerPos].y)
              ];
            resultImage[4 * (j * this.width + k) + 1] =
              this.rgbImage[
                4 * (this.centers[centerPos].x * this.width + this.centers[centerPos].y) + 1
              ];
            resultImage[4 * (j * this.width + k) + 2] =
              this.rgbImage[
                4 * (this.centers[centerPos].x * this.width + this.centers[centerPos].y) + 2
              ];
            resultImage[4 * (j * this.width + k) + 3] =
              this.rgbImage[
                4 * (this.centers[centerPos].x * this.width + this.centers[centerPos].y) + 3
              ];
          }
        }
      }
    }
    console.log('painting done...................');
    return resultImage;
  }

  // Pixelate image
  pixelDeal(step: number, iters: number, stride: number, weight: number) {
    this.step = step;
    this.iters = iters;
    this.stride = stride;
    this.weight = weight;
    console.log('step :', step);
    console.log('iters :', iters);
    console.log('weight :', weight);
    console.log('stride :', stride);

    // Translate rgb to lab
    for (let i = 0; i < this.width * this.height; i += 4) {
      let labColor = this.rgb2lab(
        this.imageArray[i],
        this.imageArray[i + 1],
        this.imageArray[i + 2],
      );
      this.imageArray[i] = labColor.l;
      this.imageArray[i + 2] = labColor.a;
      this.imageArray[i + 3] = labColor.b;
    }
    this.computePixel();
    let result = this.pickPixel();

    return result;
  }

  // ------------------------- DRAWING

  showCenters(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle =
      '#' + ('00000' + ((Math.random() * 16777215 + 0.5) >> 0).toString(16)).slice(-6);

    for (let i = 0; i < this.centers.length; i++) {
      ctx.fillRect(this.centers[i].y, this.centers[i].x, 5, 5);
    }
  }

  showContours(ctx: CanvasRenderingContext2D) {
    let dx8 = [-1, -1, 0, 1, 1, 1, 0, -1];
    let dy8 = [0, -1, -1, -1, 0, 1, 1, 1];

    let contours: Vector[] = [];
    let isTaken = Array.from({ length: this.height }).map(() =>
      Array.from({ length: this.width }).map(() => false),
    );

    for (let i = 0; i < this.height; i++) {
      for (let j = 0; j < this.width; j++) {
        let nr_p = 0;

        /* Compare the pixel to its 8 neighbours. */
        for (let k = 0; k < 8; k++) {
          let x = i + dx8[k],
            y = j + dy8[k];

          if (x >= 0 && x < this.height && y >= 0 && y < this.width) {
            if (
              isTaken[x][y] == false &&
              this.clusterID[i * this.width + j] != this.clusterID[x * this.width + y]
            ) {
              nr_p += 1;
            }
          }
        }

        /* Add the pixel to the contour list if desired. */
        if (nr_p >= 2) {
          contours.push({
            x: i,
            y: j,
          });
          isTaken[i][j] = true;
        }
      }
    }

    ctx.fillStyle = '#ffffff';

    contours.forEach((contour) => {
      ctx.fillRect(contour.y, contour.x, 1, 1);
    });
  }

  // ----------------------- UPDATING

  changeBlockSize(blockSize) {
    this.step = blockSize;
    this.computePixel();
    let result = this.pickPixel();
    return result;
  }

  changeWeight(weight) {
    this.weight = weight;
    this.computePixel();
    let result = this.pickPixel();
    return result;
  }

  changeStride(stride) {
    this.stride = stride;
    let result = this.pickPixel();
    return result;
  }

  changeIters(iters) {
    this.iters = iters;
    this.computePixel();
    let result = this.pickPixel();
    return result;
  }
}
