/**
 * TankModel: Procedural 3D model of the 5.0m x 5.0m x 4.0m Industrial Tank
 * Includes concrete foundation, steel columns, top catwalk with safety handrails,
 * service ladder, 4 internal anti-vortex baffles, bottom drain valve,
 * and 3D technical CAD dimension markers.
 */

import * as THREE from 'three';
import { ViewMode } from '../types/simulation';

export class TankModel {
  public group: THREE.Group;
  
  // Sub-components for toggling and material updates
  private acrylicWallsGroup: THREE.Group;
  private cutawayWallsGroup: THREE.Group;
  private metallicWallsGroup: THREE.Group;
  private bafflesGroup: THREE.Group;
  private dimensionsGroup: THREE.Group;

  // Materials for reuse & disposal
  private steelMaterial: THREE.MeshStandardMaterial;
  private yellowSafetyMaterial: THREE.MeshStandardMaterial;
  private concreteMaterial: THREE.MeshStandardMaterial;
  private acrylicMaterial: THREE.MeshPhysicalMaterial;
  private metallicPlateMaterial: THREE.MeshStandardMaterial;
  private brassMaterial: THREE.MeshStandardMaterial;
  private lineMaterial: THREE.LineBasicMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'IndustrialTankModel';

    // Initialize materials
    this.steelMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155, // Slate blue-gray industrial steel
      roughness: 0.35,
      metalness: 0.85,
    });

    this.yellowSafetyMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // OSHA / NR-12 Safety Yellow
      roughness: 0.4,
      metalness: 0.2,
    });

    this.concreteMaterial = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Concrete slab
      roughness: 0.9,
      metalness: 0.05,
    });

    this.brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.3,
      metalness: 0.9,
    });

    this.metallicPlateMaterial = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.3,
      metalness: 0.9,
    });

    // High quality transmissive acrylic/glass
    this.acrylicMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0.1,
      transmission: 0.88,
      ior: 1.49,
      thickness: 0.8,
      depthWrite: false,
    });

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
    });

    this.acrylicWallsGroup = new THREE.Group();
    this.cutawayWallsGroup = new THREE.Group();
    this.metallicWallsGroup = new THREE.Group();
    this.bafflesGroup = new THREE.Group();
    this.dimensionsGroup = new THREE.Group();

    this.buildFoundation();
    this.buildStructuralFrame();
    this.buildCatwalkAndLadder();
    this.buildBaffles();
    this.buildBottomDrain();
    this.buildWallVariations();
    this.buildDimensionsAndRuler();

    this.group.add(this.acrylicWallsGroup);
    this.group.add(this.cutawayWallsGroup);
    this.group.add(this.metallicWallsGroup);
    this.group.add(this.bafflesGroup);
    this.group.add(this.dimensionsGroup);

    // Initial view mode: acrylic
    this.setViewMode('acrylic');
  }

  private buildFoundation() {
    // Concrete plinth pad: 5.8m x 5.8m x 0.3m, sits from y = -0.3 to 0.0
    const padGeo = new THREE.BoxGeometry(5.8, 0.3, 5.8);
    const padMesh = new THREE.Mesh(padGeo, this.concreteMaterial);
    padMesh.position.set(0, -0.15, 0);
    padMesh.receiveShadow = true;
    this.group.add(padMesh);

    // Tank steel bottom floor plate: 5.0m x 5.0m x 0.04m, at y = 0.02
    const floorGeo = new THREE.BoxGeometry(5.0, 0.04, 5.0);
    const floorMesh = new THREE.Mesh(floorGeo, this.metallicPlateMaterial);
    floorMesh.position.set(0, 0.02, 0);
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh);

    // 4 Corner footings with anchor bolt flanges
    const corners = [
      [-2.5, -2.5],
      [2.5, -2.5],
      [-2.5, 2.5],
      [2.5, 2.5],
    ];

    const footingGeo = new THREE.BoxGeometry(0.35, 0.08, 0.35);
    corners.forEach(([cx, cz]) => {
      const footing = new THREE.Mesh(footingGeo, this.steelMaterial);
      footing.position.set(cx, 0.04, cz);
      this.group.add(footing);
    });
  }

  private buildStructuralFrame() {
    // 4 main vertical I-beam columns at corners (height 4.0m, from y=0 to y=4)
    const colGeo = new THREE.BoxGeometry(0.18, 4.0, 0.18);
    const corners = [
      [-2.5, -2.5],
      [2.5, -2.5],
      [-2.5, 2.5],
      [2.5, 2.5],
    ];

    corners.forEach(([cx, cz]) => {
      const col = new THREE.Mesh(colGeo, this.steelMaterial);
      col.position.set(cx, 2.0, cz);
      col.castShadow = true;
      col.receiveShadow = true;
      this.group.add(col);
    });

    // Top perimeter square ring beam at y = 4.0
    const horizXGeo = new THREE.BoxGeometry(5.0, 0.16, 0.16);
    const horizZGeo = new THREE.BoxGeometry(0.16, 0.16, 5.0);

    const topX1 = new THREE.Mesh(horizXGeo, this.steelMaterial);
    topX1.position.set(0, 4.0, 2.5);
    this.group.add(topX1);

    const topX2 = new THREE.Mesh(horizXGeo, this.steelMaterial);
    topX2.position.set(0, 4.0, -2.5);
    this.group.add(topX2);

    const topZ1 = new THREE.Mesh(horizZGeo, this.steelMaterial);
    topZ1.position.set(2.5, 4.0, 0);
    this.group.add(topZ1);

    const topZ2 = new THREE.Mesh(horizZGeo, this.steelMaterial);
    topZ2.position.set(-2.5, 4.0, 0);
    this.group.add(topZ2);

    // Intermediate horizontal stiffener belt at y = 2.0 (external reinforcing ribs)
    const midX1 = new THREE.Mesh(horizXGeo, this.steelMaterial);
    midX1.position.set(0, 2.0, 2.5);
    this.group.add(midX1);

    const midX2 = new THREE.Mesh(horizXGeo, this.steelMaterial);
    midX2.position.set(0, 2.0, -2.5);
    this.group.add(midX2);

    const midZ1 = new THREE.Mesh(horizZGeo, this.steelMaterial);
    midZ1.position.set(2.5, 2.0, 0);
    this.group.add(midZ1);

    const midZ2 = new THREE.Mesh(horizZGeo, this.steelMaterial);
    midZ2.position.set(-2.5, 2.0, 0);
    this.group.add(midZ2);
  }

  private buildCatwalkAndLadder() {
    // Upper Service Bridge spanning across the top (X = -2.5 to +2.5, centered at Z=0)
    // Supports the central motor & agitator gearbox
    const bridgeBeamGeo = new THREE.BoxGeometry(5.0, 0.22, 0.15);
    const beam1 = new THREE.Mesh(bridgeBeamGeo, this.steelMaterial);
    beam1.position.set(0, 4.11, 0.65);
    this.group.add(beam1);

    const beam2 = new THREE.Mesh(bridgeBeamGeo, this.steelMaterial);
    beam2.position.set(0, 4.11, -0.65);
    this.group.add(beam2);

    // Central motor mounting table: 1.4m x 1.4m plate at y = 4.22
    const tableGeo = new THREE.BoxGeometry(1.4, 0.08, 1.4);
    const tableMesh = new THREE.Mesh(tableGeo, this.steelMaterial);
    tableMesh.position.set(0, 4.22, 0);
    tableMesh.castShadow = true;
    this.group.add(tableMesh);

    // Catwalk walkway grating (side walkway for maintenance)
    const walkwayGeo = new THREE.BoxGeometry(5.0, 0.04, 0.9);
    const walkway = new THREE.Mesh(walkwayGeo, this.steelMaterial);
    walkway.position.set(0, 4.02, 1.7);
    this.group.add(walkway);

    // Yellow safety handrails along the top perimeter and catwalk (NR-12 / OSHA)
    const railHeight = 1.1;
    const postGeo = new THREE.CylinderGeometry(0.025, 0.025, railHeight, 8);
    const postPositions = [
      [-2.4, 4.55, 2.4],
      [0.0, 4.55, 2.4],
      [2.4, 4.55, 2.4],
      [-2.4, 4.55, 1.15],
      [2.4, 4.55, 1.15],
      [-2.4, 4.55, -2.4],
      [0.0, 4.55, -2.4],
      [2.4, 4.55, -2.4],
    ];

    postPositions.forEach(([px, py, pz]) => {
      const post = new THREE.Mesh(postGeo, this.yellowSafetyMaterial);
      post.position.set(px, py, pz);
      this.group.add(post);
    });

    // Horizontal top rail bars (yellow)
    const topRailLongGeo = new THREE.CylinderGeometry(0.02, 0.02, 5.0, 8);
    const topRailShortGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.3, 8);

    const frontRail = new THREE.Mesh(topRailLongGeo, this.yellowSafetyMaterial);
    frontRail.rotation.z = Math.PI / 2;
    frontRail.position.set(0, 4.0 + railHeight, 2.4);
    this.group.add(frontRail);

    const backRail = new THREE.Mesh(topRailLongGeo, this.yellowSafetyMaterial);
    backRail.rotation.z = Math.PI / 2;
    backRail.position.set(0, 4.0 + railHeight, -2.4);
    this.group.add(backRail);

    // Mid safety rails (yellow)
    const frontMidRail = new THREE.Mesh(topRailLongGeo, this.yellowSafetyMaterial);
    frontMidRail.rotation.z = Math.PI / 2;
    frontMidRail.position.set(0, 4.0 + railHeight * 0.5, 2.4);
    this.group.add(frontMidRail);

    // Industrial service ladder on side (at X = -2.55, Z = 1.7)
    const railLegGeo = new THREE.CylinderGeometry(0.02, 0.02, 4.0, 8);
    const leg1 = new THREE.Mesh(railLegGeo, this.steelMaterial);
    leg1.position.set(-2.55, 2.0, 1.45);
    this.group.add(leg1);

    const leg2 = new THREE.Mesh(railLegGeo, this.steelMaterial);
    leg2.position.set(-2.55, 2.0, 1.95);
    this.group.add(leg2);

    // 10 ladder rungs
    const rungGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8);
    for (let i = 1; i <= 10; i++) {
      const rung = new THREE.Mesh(rungGeo, this.yellowSafetyMaterial);
      rung.rotation.x = Math.PI / 2;
      rung.position.set(-2.55, i * 0.38, 1.7);
      this.group.add(rung);
    }
  }

  private buildBaffles() {
    // 4 Internal Baffles (Chicanas Defletoras Verticais)
    // In mixing tanks, 4 baffles of width T/10 to T/12 (0.42m - 0.50m) are standard
    // They prevent solid body swirl and generate high axial circulation to suspend solids!
    const baffleWidth = 0.45;
    const baffleHeight = 3.6;
    const baffleThickness = 0.03;

    const baffleZGeo = new THREE.BoxGeometry(baffleThickness, baffleHeight, baffleWidth);
    const baffleXGeo = new THREE.BoxGeometry(baffleWidth, baffleHeight, baffleThickness);

    // Baffle +X (at x = 2.5 - 0.225 = 2.275, z = 0)
    const bafflePX = new THREE.Mesh(baffleZGeo, this.steelMaterial);
    bafflePX.position.set(2.5 - baffleThickness - baffleWidth / 2, 2.0, 0);
    this.bafflesGroup.add(bafflePX);

    // Baffle -X
    const baffleNX = new THREE.Mesh(baffleZGeo, this.steelMaterial);
    baffleNX.position.set(-2.5 + baffleThickness + baffleWidth / 2, 2.0, 0);
    this.bafflesGroup.add(baffleNX);

    // Baffle +Z
    const bafflePZ = new THREE.Mesh(baffleXGeo, this.steelMaterial);
    bafflePZ.position.set(0, 2.0, 2.5 - baffleThickness - baffleWidth / 2);
    this.bafflesGroup.add(bafflePZ);

    // Baffle -Z
    const baffleNZ = new THREE.Mesh(baffleXGeo, this.steelMaterial);
    baffleNZ.position.set(0, 2.0, -2.5 + baffleThickness + baffleWidth / 2);
    this.bafflesGroup.add(baffleNZ);
  }

  private buildBottomDrain() {
    // Bottom conical purge drain sump for decanted solids / sludge evacuation
    const sumpGeo = new THREE.CylinderGeometry(0.3, 0.15, 0.35, 16);
    const sump = new THREE.Mesh(sumpGeo, this.steelMaterial);
    sump.position.set(0, -0.175, 0);
    this.group.add(sump);

    // Drain discharge pipe running towards the front-right
    const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 12);
    const pipe = new THREE.Mesh(pipeGeo, this.steelMaterial);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(1.3, -0.22, 0);
    this.group.add(pipe);

    // Butterfly purge valve with handle
    const valveBodyGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.18, 12);
    const valve = new THREE.Mesh(valveBodyGeo, this.brassMaterial);
    valve.position.set(2.35, -0.22, 0);
    this.group.add(valve);

    // Valve manual handwheel
    const wheelGeo = new THREE.TorusGeometry(0.12, 0.02, 8, 16);
    const wheel = new THREE.Mesh(wheelGeo, this.yellowSafetyMaterial);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(2.35, -0.05, 0);
    this.group.add(wheel);
  }

  private buildWallVariations() {
    const wallThickness = 0.04;
    const wallH = 4.0;
    const wallW = 5.0;

    // 1. Acrylic transparent walls (all 4 sides transparent)
    const wallGeoX = new THREE.BoxGeometry(wallThickness, wallH, wallW);
    const wallGeoZ = new THREE.BoxGeometry(wallW, wallH, wallThickness);

    const acrWallPX = new THREE.Mesh(wallGeoX, this.acrylicMaterial);
    acrWallPX.position.set(2.5, 2.0, 0);
    this.acrylicWallsGroup.add(acrWallPX);

    const acrWallNX = new THREE.Mesh(wallGeoX, this.acrylicMaterial);
    acrWallNX.position.set(-2.5, 2.0, 0);
    this.acrylicWallsGroup.add(acrWallNX);

    const acrWallPZ = new THREE.Mesh(wallGeoZ, this.acrylicMaterial);
    acrWallPZ.position.set(0, 2.0, 2.5);
    this.acrylicWallsGroup.add(acrWallPZ);

    const acrWallNZ = new THREE.Mesh(wallGeoZ, this.acrylicMaterial);
    acrWallNZ.position.set(0, 2.0, -2.5);
    this.acrylicWallsGroup.add(acrWallNZ);

    // 2. Cutaway walls: Back wall (-Z) and Left wall (-X) are solid, front (+Z) and right (+X) are open
    const cutWallBack = new THREE.Mesh(wallGeoZ, this.metallicPlateMaterial);
    cutWallBack.position.set(0, 2.0, -2.5);
    this.cutawayWallsGroup.add(cutWallBack);

    const cutWallLeft = new THREE.Mesh(wallGeoX, this.metallicPlateMaterial);
    cutWallLeft.position.set(-2.5, 2.0, 0);
    this.cutawayWallsGroup.add(cutWallLeft);

    // 3. Metallic walls with 4 circular borosilicate inspection viewports
    const metWallPX = new THREE.Mesh(wallGeoX, this.metallicPlateMaterial);
    metWallPX.position.set(2.5, 2.0, 0);
    this.metallicWallsGroup.add(metWallPX);

    const metWallNX = new THREE.Mesh(wallGeoX, this.metallicPlateMaterial);
    metWallNX.position.set(-2.5, 2.0, 0);
    this.metallicWallsGroup.add(metWallNX);

    const metWallNZ = new THREE.Mesh(wallGeoZ, this.metallicPlateMaterial);
    metWallNZ.position.set(0, 2.0, -2.5);
    this.metallicWallsGroup.add(metWallNZ);

    // Front wall has a large center inspection sight glass
    const metWallPZ = new THREE.Mesh(wallGeoZ, this.metallicPlateMaterial);
    metWallPZ.position.set(0, 2.0, 2.5);
    this.metallicWallsGroup.add(metWallPZ);

    // Circular inspection viewport rings on front
    const portGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.08, 24);
    portGeo.rotateX(Math.PI / 2);
    const portFlange = new THREE.Mesh(portGeo, this.steelMaterial);
    portFlange.position.set(0, 1.8, 2.52);
    this.metallicWallsGroup.add(portFlange);

    const portGlassGeo = new THREE.CircleGeometry(0.48, 24);
    const portGlass = new THREE.Mesh(portGlassGeo, this.acrylicMaterial);
    portGlass.position.set(0, 1.8, 2.57);
    this.metallicWallsGroup.add(portGlass);
  }

  private buildDimensionsAndRuler() {
    // 3D Technical CAD Dimension markers for 5.0m x 5.0m x 4.0m
    const offset = 0.5;

    // Dimension line along X (Length: 5.00 m) at Z = 2.5 + offset, Y = 0.1
    this.createDimensionLine(
      new THREE.Vector3(-2.5, 0.1, 2.5 + offset),
      new THREE.Vector3(2.5, 0.1, 2.5 + offset),
      'COMPRIMENTO: 5.00 m'
    );

    // Dimension line along Z (Width: 5.00 m) at X = 2.5 + offset, Y = 0.1
    this.createDimensionLine(
      new THREE.Vector3(2.5 + offset, 0.1, -2.5),
      new THREE.Vector3(2.5 + offset, 0.1, 2.5),
      'LARGURA: 5.00 m'
    );

    // Dimension line along Y (Height: 4.00 m) at X = -2.5 - offset, Z = 2.5 + offset
    this.createDimensionLine(
      new THREE.Vector3(-2.5 - offset, 0.0, 2.5 + offset),
      new THREE.Vector3(-2.5 - offset, 4.0, 2.5 + offset),
      'ALTURA: 4.00 m'
    );

    // Level measurement ruler on front right column (0 to 4.0m with tick marks)
    const rulerBoardGeo = new THREE.BoxGeometry(0.12, 4.0, 0.02);
    const rulerBoard = new THREE.Mesh(
      rulerBoardGeo,
      new THREE.MeshBasicMaterial({ color: 0x0f172a })
    );
    rulerBoard.position.set(2.58, 2.0, 2.45);
    this.dimensionsGroup.add(rulerBoard);

    // Tick marks every 0.5m
    for (let y = 0; y <= 4.0; y += 0.5) {
      const tickGeo = new THREE.BoxGeometry(0.08, 0.02, 0.03);
      const tick = new THREE.Mesh(
        tickGeo,
        new THREE.MeshBasicMaterial({ color: y % 1.0 === 0 ? 0x38bdf8 : 0x94a3b8 })
      );
      tick.position.set(2.58, y, 2.47);
      this.dimensionsGroup.add(tick);

      // Create text sprite for 1.0m, 2.0m, 3.0m, 4.0m
      if (y > 0 && y % 1.0 === 0) {
        const textSprite = this.createTextSprite(`${y.toFixed(1)}m`, '#38bdf8', 42);
        textSprite.position.set(2.78, y, 2.47);
        textSprite.scale.set(0.45, 0.22, 1);
        this.dimensionsGroup.add(textSprite);
      }
    }
  }

  private createDimensionLine(start: THREE.Vector3, end: THREE.Vector3, labelText: string) {
    const points = [start, end];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, this.lineMaterial);
    this.dimensionsGroup.add(line);

    // Tick ends
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(dir, up).normalize();
    if (perp.length() < 0.1) {
      perp.set(1, 0, 0);
    }

    const tickLen = 0.18;
    const tick1Geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3().copy(start).addScaledVector(perp, -tickLen),
      new THREE.Vector3().copy(start).addScaledVector(perp, tickLen),
    ]);
    const tick2Geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3().copy(end).addScaledVector(perp, -tickLen),
      new THREE.Vector3().copy(end).addScaledVector(perp, tickLen),
    ]);
    this.dimensionsGroup.add(new THREE.Line(tick1Geo, this.lineMaterial));
    this.dimensionsGroup.add(new THREE.Line(tick2Geo, this.lineMaterial));

    // Midpoint label text
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y += 0.22;
    const textSprite = this.createTextSprite(labelText, '#38bdf8', 46);
    textSprite.position.copy(mid);
    textSprite.scale.set(1.5, 0.45, 1);
    this.dimensionsGroup.add(textSprite);
  }

  private createTextSprite(text: string, color: string, fontSize = 48): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 384, 128);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.roundRect(8, 16, 368, 96, 12);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.font = `bold ${fontSize}px monospace, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, 192, 64);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    return new THREE.Sprite(spriteMaterial);
  }

  public setViewMode(mode: ViewMode) {
    this.acrylicWallsGroup.visible = mode === 'acrylic';
    this.cutawayWallsGroup.visible = mode === 'cutaway';
    this.metallicWallsGroup.visible = mode === 'metallic';
  }

  public setBafflesVisible(visible: boolean) {
    this.bafflesGroup.visible = visible;
  }

  public setDimensionsVisible(visible: boolean) {
    this.dimensionsGroup.visible = visible;
  }

  public dispose() {
    this.steelMaterial.dispose();
    this.yellowSafetyMaterial.dispose();
    this.concreteMaterial.dispose();
    this.acrylicMaterial.dispose();
    this.metallicPlateMaterial.dispose();
    this.brassMaterial.dispose();
    this.lineMaterial.dispose();
  }
}
