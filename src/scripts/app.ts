// app.ts

import * as PIXI from 'pixi.js';
import * as Projections from 'pixi-projection';
import {Spine} from 'pixi-spine'; 
import { FpsMeter } from './fps-meter';

interface EngineParams {
    containerId: string,
    canvasW: number,
    canvasH: number,
    fpsMax: number
}

class App {
    public container: HTMLElement;
    public loader: PIXI.Loader;
    public renderer: PIXI.Renderer;
    public stage: PIXI.Container;
    public fpsMax: number;
    public app: PIXI.Application;
    public carouselPlanes: CarouselPlane[] = [];
    public resources: any; 
    public animsPlaying: any = [];

    public isCarouselRotating: boolean = false; 
    
    private carouselRotationSpeed: number = 0.03; 
    private carouselEnabled: boolean = false; 
    
    /**
     * only stores a reference to the planes in an ordered fashion for easy iterations
     */
    private carouselOrderedPlanes: CarouselPlane[] = [];
    private carouselStartingPlanePositions: PIXI.Point[] = [];
    private carouselStartingVectors: { vectorCoords: any[], deltaVectorCoords: any[] }[] = [];
    private carouselLeftEndPlanePosition: PIXI.Point|null = null;
    private carouselRightEndPlanePosition: PIXI.Point|null = null;
    private carouselLeftEndPlaneVectors: { vectorCoords: any[], deltaVectorCoords: any[] }|null = null;
    private carouselRightEndPlaneVectors: { vectorCoords: any[], deltaVectorCoords: any[] }|null = null;

    /**
     * NOTE: this needs to be odd number, so that there can be a plane always in the middle
     */
    private carouselPlanesCount: number = 9; 
    private carouselSkew = -0.034; 
    private carouselSkewIncre = -0.02; 
    private carouselWidthMod = 1.85;
    private carouselWidthIncre = 0.68; 

    /**
     * needs to be assigned after textures have been loaded
     */
    private carouselPlaneTexture: PIXI.Texture|null = null;
    private carouselPlaneDummyTexture: PIXI.Texture|null = null;

    constructor(params: EngineParams) {
        this.loader = PIXI.Loader.shared;
        this.app = new PIXI.Application({ backgroundColor: 0x1099bb, width: window.innerWidth*0.96, height: window.innerHeight*0.96, antialias: false });
        this.renderer = this.app.renderer as PIXI.Renderer;
        this.stage = this.app.stage;
        this.fpsMax = params.fpsMax;

        this.container = params.containerId ? document.getElementById(params.containerId) || document.body : document.body;
        this.container.appendChild(this.renderer.view);

        document.body.appendChild(this.app.view); 

    } // constructor


    public init ()
    {
        this.initCarouselPlanes(); 
        this.addInteraction(); 
    }


    public addInteraction ()
    {
        const lFunc = ()=> 
        { 
            if(this.isCarouselRotating)
            {
                this.stopAllAnims(); 
            }
            else
            {
                this.playRotateCarousel(); 
            }
        }; 
        (document.body as any).onpointerdown = lFunc;
        document.addEventListener('keyup', (_event) =>
        {
            if(_event.ctrlKey && _event.key == ' ')
            {
                this.stopAllAnims(); 
                this.setCarousel(true); 
            }
            // space bar was pressed
            else if(_event.key == ' ')
            {
                lFunc(); 
            }
        }, false);
    }

    private initCarouselPlanes ()
    {
        const lDummyTexture = PIXI.Texture.from(carousel_plane_dummy); 
        const lCarouselPlaneTexture = PIXI.Texture.from(carousel_plane_front); 
        this.carouselPlaneDummyTexture = lDummyTexture; 
        this.carouselPlaneTexture = lCarouselPlaneTexture; 
        const lPlanesCount = this.carouselPlanesCount; 
        // NOTE: lMid only takes into account odd number planes count scenario. 
        const lMid = Math.floor(lPlanesCount /2); 

        // add an extra plane to the end for transitional phase when rotating the carousel
        for(let i = 0; i < lPlanesCount + 1; i++)
        {
            const lIndex = i == lMid ? 0 : i - lMid;
            const lLeftNeighbour = i > 0 ? this.carouselPlanes[i-1] : null; 
            const lPlane = new CarouselPlane(i, new PIXI.Point(lDummyTexture.width * lIndex, 0), lDummyTexture, lCarouselPlaneTexture, lLeftNeighbour, null); 
            if(lLeftNeighbour)
            {
                lLeftNeighbour.rightNeighbour = lPlane; 
            }

            this.carouselPlanes.push(lPlane); 
            carouselContainer.addChild(lPlane.container);
        }

        this.initCarousel();
        this.initCarouselBounds(); 
        
        const lScale = 0.6; 
        carouselContainer.scale.set(lScale, lScale); 
        carouselContainer.x = app.renderer.screen.width/2; 
        carouselContainer.y = app.renderer.screen.height/2; // + (carouselContainer.height/3);
    }


    public resetCarousel (_updateCarouselEnabled: boolean = true)
    {
        if(_updateCarouselEnabled)
            this.carouselEnabled = false; 

        for(let i = 0; i < this.carouselPlanes.length; i++)
        {
            const lPlane = this.carouselPlanes[i];
            lPlane.reset(); 
            lPlane.leftNeighbour = i == 0 ? null : this.carouselPlanes[i-1]; 
            lPlane.rightNeighbour = i >= this.carouselPlanes.length-1 ? null : this.carouselPlanes[i+1];
            lPlane.carouselIndex = i; 

            if(this.carouselStartingPlanePositions.length > 0)
                lPlane.x = this.carouselStartingPlanePositions[i].x; 
            this.carouselOrderedPlanes[i] = lPlane; 
        }
        this.carouselPlanes[this.carouselPlanes.length-1].visible = false; 
    }

    private initCarousel ()
    {
        this.setCarousel(true); 
        carouselContainer.addChildAt(this.carouselPlanes[this.carouselPlanes.length-1].container, 0); 

        for(let i = 0; i < this.carouselPlanes.length; i++)
        {
            const lPlane: CarouselPlane = this.carouselPlanes[i]; 

            // save the positions for animstions
            this.carouselStartingPlanePositions.push(new PIXI.Point(lPlane.x, lPlane.y));

            // save the vectors for animations
            this.carouselStartingVectors.push({
                vectorCoords: JSON.parse(JSON.stringify(lPlane.vectorCoords)),
                deltaVectorCoords: JSON.parse(JSON.stringify(lPlane.deltaVectorCoords)),
            });
        }

        this.carouselRightEndPlanePosition = this.carouselStartingPlanePositions[this.carouselPlanes.length-1];
        this.carouselRightEndPlaneVectors = this.carouselStartingVectors[this.carouselPlanes.length-1];
    }


    private initCarouselBounds ()
    {
        const lBounds: PIXI.Sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
        lBounds.width = carouselContainer.width; 
        lBounds.height = carouselContainer.height; 
        lBounds.x = -carouselContainer.width/2; 
        lBounds.y = -carouselContainer.height/2;
        lBounds.y += this.carouselPlanes[0].deltaVectorCoords[0].y /2; 

        carouselContainer.addChildAt(lBounds, 0); 
    }


    private setCarousel (_enable: boolean)
    {
        this.carouselEnabled = _enable;   

        if(_enable)
        {            
            this.updateCarousel(this.carouselSkew, this.carouselSkewIncre, this.carouselWidthMod, this.carouselWidthIncre, false); 
        }
        else
        {
            this.resetCarousel(false); 
        }
    }


    public toggleCarousel ()
    {
        this.setCarousel(!this.carouselEnabled); 
    }
    
    public updateCarousel (_skew: number, _skewIncre: number, _widthMod: number, _widthIncre: number, _resetCarousel: boolean = true)
    {
        this.resetCarousel(false); 
        
        const lPlanesCount = this.carouselPlanesCount; 
        const lMid = Math.floor(lPlanesCount /2); 

        // fan out from middle to the right
        for(let i = lPlanesCount-lMid-1, lCurrSkew = 0, lWidthMod = _widthMod; i < lPlanesCount; i++)
        {
            const lIndex = Math.max((i-lMid), 0);
            this.skewY(i, lCurrSkew, lWidthMod, true, i < lPlanesCount -1); 
            lCurrSkew += _skew + _skewIncre*lIndex; 
            lWidthMod += _widthIncre * _widthMod;
        }
        
        // fan out from middle to the left
        for(let i = lMid, lCurrSkew = 0, lWidthMod = _widthMod; i >= 0; i--)
        {
            const lIndex = Math.max((lMid-i), 0);
            this.skewY(i, lCurrSkew, lWidthMod, false); 
            lCurrSkew += _skew + _skewIncre*lIndex; 
            lWidthMod += _widthIncre * _widthMod;
        }

        const lTransitionalPlane: CarouselPlane = this.carouselPlanes[this.carouselPlanes.length-1];
        const lLastPlane: CarouselPlane = this.carouselPlanes[lPlanesCount-1];
        lTransitionalPlane.x = lLastPlane.x; 
        lTransitionalPlane.setVectorCoords(lLastPlane.vectorCoords, lLastPlane.deltaVectorCoords); 

        // // set both lines to match last plane's right line
        lTransitionalPlane.vectorCoords[0].x = lLastPlane.vectorCoords[1].x;
        lTransitionalPlane.vectorCoords[0].y = lLastPlane.vectorCoords[1].y;
        lTransitionalPlane.vectorCoords[3].x = lLastPlane.vectorCoords[2].x;
        lTransitionalPlane.vectorCoords[3].y = lLastPlane.vectorCoords[2].y;
        lTransitionalPlane.deltaVectorCoords[0].x = lLastPlane.deltaVectorCoords[1].x;
        lTransitionalPlane.deltaVectorCoords[0].y = lLastPlane.deltaVectorCoords[1].y;
        lTransitionalPlane.deltaVectorCoords[3].x = lLastPlane.deltaVectorCoords[2].x;
        lTransitionalPlane.deltaVectorCoords[3].y = lLastPlane.deltaVectorCoords[2].y;

        lTransitionalPlane.mapSprite(); 
    }


    public updateCarouselTop (_skew: number, _skewIncre: number, _widthMod: number, _widthIncre: number, _resetCarousel: boolean = true)
    {
        // only adjust top, instead of using translateLine, we need to translate vectors only
        // we could create a 3D perspective with a bigger or smaller top/bottom
    }


    public translateLineY (_id: number, _left: number, _right: number)
    {
        this.carouselPlanes[_id].translateLineY(_left, _right, true);
    }

    public translateLineX (_id: number, _left: number, _right: number)
    {
        this.carouselPlanes[_id].translateLineX(_left, _right, true); 
    }


    /**
     * 
     * @param _id - plane id
     * @param _skew - normalised value (0-1), negative goes up, positive goes down
     * @param _skewRightLine - determines which line to skew/translate
     */
    public skewY (_id: number, _skew: number, _widthMod: number, _skewRightLine: boolean, _affectNeighbour: boolean = true)
    {
        const lTranslateY = _skew * this.carouselPlaneTexture!.height; 
        const lLeftY = _skewRightLine ? 0 : lTranslateY; 
        const lRightY = _skewRightLine ? lTranslateY : 0; 

        const lTranslateX = Math.abs(_skew * this.carouselPlaneTexture!.width) * _widthMod;
        const lLeftX = lTranslateX * (_skewRightLine ? 0 : 1); 
        const lRightX = lTranslateX * (_skewRightLine ? -1 : 0); 
        
        this.carouselPlanes[_id].translateLineX(lLeftX, lRightX, _affectNeighbour); 
        this.carouselPlanes[_id].translateLineY(lLeftY, lRightY, _affectNeighbour); 
    }


    public playSkewY ()
    {
        this.stopAllAnims(); 

        const lAnim = (_delta: any) =>
        {
            const lPlanesCount = this.carouselPlanesCount; 
            const lMid = Math.floor(lPlanesCount /2); 
            for(let i = 0; i < lPlanesCount; i++)
            {
                const lIndex = i == lMid ? 0 : i - lMid;

            }
        };
        this.animsPlaying.push(lAnim);
        app.app.ticker.add(lAnim, this); 
    }


    public playRotateCarousel ()
    {
        if(!this.isCarouselRotating)
        {
            this.isCarouselRotating = true; 

            const lAnim = (_delta: any) =>
            {
                const lSpeed = this.carouselRotationSpeed; 
                let lPlaneReachedEnd: boolean = false; 

                const lCarouselPlanesLength: number = this.carouselPlanes.length; 

                // need to iterate through based on carousel curr index
                for(let i = 0; i < lCarouselPlanesLength; i++)
                {
                    const lPlane: CarouselPlane = this.carouselOrderedPlanes[i]; 
                    const lTranslationVector = new PIXI.Point(0,0); 

                    // enable visibility if hidden as a transitional phase
                    if(!lPlane.visible)
                    {
                        lPlane.visible = true; 
                    }

                    const lCurrStartingVectors = this.carouselStartingVectors[i].vectorCoords;

                    // normal translation vector (use original starting vectors to create translation vector)
                    lTranslationVector.x = lCurrStartingVectors[0].x - lCurrStartingVectors[1].x
                    lTranslationVector.y = lCurrStartingVectors[0].y - lCurrStartingVectors[1].y

                    // move right line towards left line (i.e. move step)
                    const lRightLineStep = new PIXI.Point(
                        lTranslationVector.x * _delta * lSpeed,
                        lTranslationVector.y * _delta * lSpeed
                    ); 
                    
                    // snap it, as the step would cause an overflow only when moving left and there's no neighbour to the left
                    if((lPlane.vectorCoords[1].x + lRightLineStep.x <= lPlane.vectorCoords[0].x) && 
                        !lPlane.leftNeighbour)
                    {
                        lRightLineStep.x = lPlane.vectorCoords[0].x - lPlane.vectorCoords[1].x; 
                        lRightLineStep.y = lPlane.vectorCoords[0].y - lPlane.vectorCoords[1].y; 
                        lPlane.reachedCarouselEnd = true; 

                        // unlink the neighbour pairing, as this plane is going to be moved to the other end on next frame
                        lPlane.rightNeighbour?.leftNeighbour == null; 
                    }
                    // translate this plane's and its neighbour's coupled line
                    lPlane.translateLine(new PIXI.Point(0,0), lRightLineStep, true);


                    // move to the other end and set new coupling
                    if(lPlane.reachedCarouselEnd)
                    {
                        lPlane.reachedCarouselEnd = false; 
                        lPlaneReachedEnd = true; 
                        
                        // link up left neighbour to the last plane
                        const lLeftNeighbour = i == 0 ? this.carouselOrderedPlanes[lCarouselPlanesLength-1] : this.carouselOrderedPlanes[i-1];
                        if(!lPlane.leftNeighbour)
                        {
                            lPlane.leftNeighbour = lLeftNeighbour;
                            lPlane.rightNeighbour!.leftNeighbour = null; 
                            lPlane.rightNeighbour = null; 
                            lLeftNeighbour.rightNeighbour = lPlane; 
                        }

                        // reposition to the other end
                        lPlane.x = this.carouselRightEndPlanePosition!.x; 
                        
                        // set to end of carousel starting position and vectors
                        lPlane.setVectorCoords(this.carouselRightEndPlaneVectors!.vectorCoords, this.carouselRightEndPlaneVectors!.deltaVectorCoords);

                        // set left line to match new neighbour's right line
                        lPlane.vectorCoords[0].x = lLeftNeighbour.vectorCoords[1].x;
                        lPlane.vectorCoords[0].y = lLeftNeighbour.vectorCoords[1].y;
                        lPlane.vectorCoords[3].x = lLeftNeighbour.vectorCoords[2].x;
                        lPlane.vectorCoords[3].y = lLeftNeighbour.vectorCoords[2].y;
                        lPlane.deltaVectorCoords[0].x = lLeftNeighbour.deltaVectorCoords[1].x;
                        lPlane.deltaVectorCoords[0].y = lLeftNeighbour.deltaVectorCoords[1].y;
                        lPlane.deltaVectorCoords[3].x = lLeftNeighbour.deltaVectorCoords[2].x;
                        lPlane.deltaVectorCoords[3].y = lLeftNeighbour.deltaVectorCoords[2].y;

                        lPlane.visible = false; 
                    }                    
                }

                // update plane's curr carousel index
                if(lPlaneReachedEnd)
                {
                    lPlaneReachedEnd = false; 
                    for(let i = 0; i < lCarouselPlanesLength; i++)
                    {
                        const lPlane: CarouselPlane = this.carouselPlanes[i]; 
                        lPlane.carouselIndex = lPlane.carouselIndex == 0 ? lCarouselPlanesLength -1 : lPlane.carouselIndex -1; 
                        this.carouselOrderedPlanes[lPlane.carouselIndex] = lPlane; 

                        // correct shape
                        const lCurrStartingVectors = this.carouselStartingVectors[lPlane.carouselIndex];
                        lPlane.x = this.carouselStartingPlanePositions[lPlane.carouselIndex].x; 
                        lPlane.setVectorCoords(lCurrStartingVectors.vectorCoords, lCurrStartingVectors.deltaVectorCoords, true);
                    }
                }
    
            };
            this.animsPlaying.push(lAnim);
            app.app.ticker.add(lAnim, this); 
        }
    }


    private getDistanceBetweenTwoPoints (_p1: PIXI.Point, _p2: PIXI.Point): number
    {
        const a = _p1.x - _p2.x; 
        const b = _p1.y - _p2.y; 
        return Math.sqrt(a*a + b*b); 
    }


    public stopAllAnims ()
    {
        this.isCarouselRotating = false; 
        this.animsPlaying.forEach((_anim: any) => {
            app.app.ticker.remove(_anim, this);
        });
    }


} // Engine



class CarouselPlane
{
    public id: number; 
    public planeDummyTexture: PIXI.Texture;
    public planeTexture: PIXI.Texture; 
    public container: Projections.Sprite2d;
    public planeSprite: PIXI.Sprite; 
    public vectorCoords: any[] = []; 
    public deltaVectorCoords: any[] = [];
    public startingPos: PIXI.Point; 
    public leftNeighbour: CarouselPlane|null = null; 
    public rightNeighbour: CarouselPlane|null = null;
    public reachedCarouselEnd: boolean = false; 
    private currCarouselIndex: number; 

    
    private textLabel: PIXI.Text|null = null; 
    
    
    public get x (): number { return this.container.x; }  
    public set x (_value: number) { this.container.x = _value; }  
    public get y (): number { return this.container.y; }  
    public set y (_value: number) { this.container.y = _value; }  
    public get position (): PIXI.Point { return this.container.position; } 
    public set position (_value: PIXI.Point) { this.container.position.set(_value.x, _value.y); } 
    public get visible (): boolean { return this.container.visible; }
    public set visible (_value: boolean) { this.container.visible = _value; }
    public get carouselIndex (): number { return this.currCarouselIndex; }
    public set carouselIndex (_value: number) 
    { 
        this.currCarouselIndex = _value; 
        if(this.textLabel)
        {
            this.textLabel.text = "id: " + this.id + "\n" +
                                  "cId: " + _value;
        }
    }


    public constructor (_id: number, _pos: PIXI.Point = new PIXI.Point(0,0), _dummyTexture: PIXI.Texture, _carouselPlaneTexture: PIXI.Texture, _leftNeighbour: CarouselPlane|null, _rightNeighbour: CarouselPlane|null)
    {
        this.id = _id; 
        this.currCarouselIndex = _id; 
        this.startingPos = _pos; 
        this.planeDummyTexture = _dummyTexture;
        this.planeTexture = _carouselPlaneTexture;
        this.container = new Projections.Sprite2d(this.planeDummyTexture);
        this.planeSprite = new PIXI.Sprite(_carouselPlaneTexture);
        this.leftNeighbour = _leftNeighbour; 
        this.rightNeighbour = _rightNeighbour; 

        this.initPlane(); 
    }
    
    
    private initPlane ()
    {
        const lDummy = this.planeDummyTexture;
        const lPos = this.startingPos; 
        
        this.initVectorCoords(); 

        this.container.addChild(this.planeSprite); 
        
        this.container.pivot.set(lDummy.width/2, lDummy.height/2); 
        this.container.position.set(lPos.x, lPos.y); 
        
        this.initMask(); 

        this.initTextLabel(); 
    }


    private initTextLabel ()
    {
        this.textLabel = new PIXI.Text("id: " + this.id + "\n" +
                                       "cId: " + this.carouselIndex); 
        this.container.addChild(this.textLabel);
    }


    private initVectorCoords ()
    {
        const lTexture = this.planeDummyTexture;
        const lPos = this.startingPos; 
        this.vectorCoords = [
            {x: 0, y: 0}, 
            {x: lTexture.width, y: 0}, 
            {x: lTexture.width, y: lTexture.height}, 
            {x: 0, y: lTexture.height}
        ];
        this.deltaVectorCoords = [
            {x:0, y:0},
            {x:0, y:0},
            {x:0, y:0},
            {x:0, y:0},
        ];
    }



    public setVectorCoords (_vectorCoords: any[], _deltaVectorCoords: any[], _mapSprite: boolean = false)
    {
        for(let i = 0; i < this.vectorCoords.length; i++)
        {
            
            this.vectorCoords[i].x = _vectorCoords[i].x; 
            this.vectorCoords[i].y = _vectorCoords[i].y; 
            this.deltaVectorCoords[i].x = _deltaVectorCoords[i].x; 
            this.deltaVectorCoords[i].y = _deltaVectorCoords[i].y; 
        }

        if(_mapSprite)
            this.mapSprite(); 
    }


    private initMask ()
    {
        const lMask: PIXI.Sprite = new PIXI.Sprite(PIXI.Texture.WHITE); 
        lMask.width = this.planeDummyTexture.width; 
        lMask.height = this.planeDummyTexture.height; 
        lMask.isMask = true; 
        this.container.addChild(lMask); 
        this.container.mask = lMask; 
    }


    public reset ()
    {
        this.initVectorCoords(); 
        this.container.x = this.startingPos.x; 
        this.container.y = this.startingPos.y; 
        this.visible = true; 
        this.reachedCarouselEnd = false; 
        this.mapSprite(); 
    }
   

    public translateY (_value: number)
    {
        this.translateLineY(_value, _value, true); 
    }

    public translateLine (_left: PIXI.Point, _right: PIXI.Point, _moveNeighbour: boolean = false)
    {
        // left side
        if(_left.x != 0 || _left.y != 0)
        {
            this.vectorCoords[0].x += _left.x;
            this.vectorCoords[3].x += _left.x;
            this.deltaVectorCoords[0].x += _left.x;
            this.deltaVectorCoords[3].x += _left.x;

            this.vectorCoords[0].y += _left.y;
            this.vectorCoords[3].y += _left.y;
            this.deltaVectorCoords[0].y += _left.y;
            this.deltaVectorCoords[3].y += _left.y;
            
            // left neighbour's right side
            if(_moveNeighbour)
            {
                this.leftNeighbour?.translateLine(new PIXI.Point(0,0), _left); 
            }
        }

        // right side
        if(_right.x != 0 || _right.y != 0)
        {
            this.vectorCoords[1].x += _right.x;
            this.vectorCoords[2].x += _right.x;
            this.deltaVectorCoords[1].x += _right.x;
            this.deltaVectorCoords[2].x += _right.x;

            this.vectorCoords[1].y += _right.y;
            this.vectorCoords[2].y += _right.y;
            this.deltaVectorCoords[1].y += _right.y;
            this.deltaVectorCoords[2].y += _right.y;

            // right neighbour's left side
            if(_moveNeighbour)
            {
                this.rightNeighbour?.translateLine(_right, new PIXI.Point(0,0)); 
            }
        }

        this.mapSprite(); 
    }

    public translateLineY (_left: number, _right: number, _moveNeighbour: boolean = false)
    {
        // left side
        if(_left != 0)
        {
            this.vectorCoords[0].y += _left;
            this.vectorCoords[3].y += _left;
            this.deltaVectorCoords[0].y += _left;
            this.deltaVectorCoords[3].y += _left;
            
            // left neighbour's right side
            if(_moveNeighbour)
            {
                this.leftNeighbour?.translateLineY(0, _left); 
            }
        }

        // right side
        if(_right != 0)
        {
            this.vectorCoords[1].y += _right;
            this.vectorCoords[2].y += _right;
            this.deltaVectorCoords[1].y += _right;
            this.deltaVectorCoords[2].y += _right;
            // right neighbour's left side
            if(_moveNeighbour)
            {
                this.rightNeighbour?.translateLineY(_right, 0); 
            }
        }
        this.mapSprite(); 
    }



    public translateX (_value: number)
    {
        this.translateLineX(_value, _value, true); 
    }


    public translateLineX (_left: number, _right: number, _moveNeighbour: boolean = false)
    {
        // left side
        if(_left != 0)
        {
            this.vectorCoords[0].x += _left;
            this.vectorCoords[3].x += _left;
            // left neighbour's right side
            if(_moveNeighbour)
            {
                this.leftNeighbour?.translateLineX(0, _left); 
            }
        }

        // right side
        if(_right != 0)
        {
            this.vectorCoords[1].x += _right;
            this.vectorCoords[2].x += _right;
            // right neighbour's left side
            if(_moveNeighbour)
            {
                this.rightNeighbour?.translateLineX(_right, 0); 
            }
        }
        this.mapSprite(); 
    }


    public mapSprite ()
    {
        this.container.proj.mapSprite(this.container, this.vectorCoords);
    }
}

const app = (window as any)["App"] = new App({
    containerId: 'game',
    canvasW: 1280,
    canvasH: 720,
    fpsMax: 60
});

let fpsMeter: FpsMeter;
// const sprite = PIXI.Sprite.from('images/logo.png');
const carousel_plane_front = 'images/wooden_plane_front.jpg';
const carousel_plane_dummy = 'images/wooden_plane_dummy.png';
const sprite_filepath = 'images/logo.png';
const carouselContainer = new PIXI.Container();

// ==============
// === STATES ===
// ==============

window.onload = load;

function load() {
    app.loader
        .add('pixiSprite', sprite_filepath)
        .add('wooden_plane_dummy', carousel_plane_dummy)
        .add('wooden_plane_front', carousel_plane_front)
        .load((loader, resources) =>
        {            
            app.resources = resources; 
            create();
            app.init(); 
        });
} // load

function create() {
    /* ***************************** */
    /* Create your Game Objects here */
    /* ***************************** */


    app.stage.addChild(carouselContainer);

    
    /* FPS */
    const fpsMeterItem = document.createElement('div');
    fpsMeterItem.classList.add('fps');
    document.body.appendChild(fpsMeterItem);
    
    fpsMeter = new FpsMeter(() => {
        fpsMeterItem.innerHTML = 'FPS: ' + fpsMeter.getFrameRate().toFixed(2).toString();
    });
    
    setInterval(update, 1000.0 / app.fpsMax);
    render();
} // create


(window as any)["setPoint"] = (_id: number) =>
{

};

function update() {
    fpsMeter.updateTime();

    /* ***************************** */
    /* Update your Game Objects here */
    /* ***************************** */

} // update

function render() {
    requestAnimationFrame(render);

    /* ***************************** */
    /* Render your Game Objects here */
    /* ***************************** */

    /* Sprite */
    // sprite.rotation += 0.01;

    app.renderer.render(app.stage);
    fpsMeter.tick();
} // render
