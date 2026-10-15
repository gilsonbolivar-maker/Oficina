/**
 * AgitatorModel: Procedural 3D model of the central mechanical agitator
 * Mounted on the top bridge of the 5x5x4m tank.
 * Includes electric motor with cooling fins, reduction gearbox, rigid coupling,
 * heavy-duty stainless steel shaft, lower axial 4-blade pitched turbine (solids lifter),
 * and mid-level 6-blade Rushton radial dispersion turbine.
 */

import * as THREE from 'three';

export class AgitatorModel {
  public group: THREE.Group;
  public rotatingShaftGroup: THREE.Group; // Group containing the shaft and impellers that spins

  private motorMaterial: THREE.MeshStandardMaterial;
  private shaftMaterial: THREE.MeshStandardMaterial;
  private impellerMaterial: THREE.MeshStandardMaterial;
  private gearboxMaterial: THREE.MeshStandardMaterial;
  private boltMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CentralAgitatorAssembly';

    this.rotatingShaftGroup = new THREE.Group();
    this.rotatingShaftGroup.name = 'RotatingShaftAndImpellers';

    // Materials
    this.motorMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8, // Industrial Electric Motor Blue (WEG / Siemens blue)
      roughness: 0.35,
      metalness: 0.5,
    });

    this.gearboxMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155, // Dark slate cast iron
      roughness: 0.6,
      metalness: 0.7,
    });

    this.shaftMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0, // Polished AISI 316 Stainless Steel
      roughness: 0.15,
      metalness: 0.95,
    });

    this.impellerMaterial = new THREE.MeshStandardMaterial({
      color: 0xcfd8dc, // Stainless steel blades
      roughness: 0.22,
      metalness: 0.92,
    });

    this.boltMaterial = new THREE.MeshStandardMaterial({
      color: 0xd97706, // High-strength zinc/brass dichromate bolts
      roughness: 0.3,
      metalness: 0.85,
    });

    this.buildStaticMotorDrive();
    this.buildRotatingAssembly();

    this.group.add(this.rotatingShaftGroup);
  }

  private buildStaticMotorDrive() {
    // Gearbox housing: at Y = 4.25m to 4.75m
    const gearboxBaseGeo = new THREE.BoxGeometry(0.85, 0.5, 0.85);
    const gearbox = new THREE.Mesh(gearboxBaseGeo, this.gearboxMaterial);
    gearbox.position.set(0, 4.47, 0);
    gearbox.castShadow = true;
    this.group.add(gearbox);

    // Motor flange adapter
    const adapterGeo = new THREE.CylinderGeometry(0.35, 0.42, 0.2, 16);
    const adapter = new THREE.Mesh(adapterGeo, this.gearboxMaterial);
    adapter.position.set(0, 4.82, 0);
    this.group.add(adapter);

    // TEFC Electric Motor Body: cylindrical with cooling fins
    const motorBodyGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.75, 24);
    const motor = new THREE.Mesh(motorBodyGeo, this.motorMaterial);
    motor.position.set(0, 5.29, 0);
    motor.castShadow = true;
    this.group.add(motor);

    // Cooling fins around motor
    const finGeo = new THREE.BoxGeometry(0.68, 0.7, 0.015);
    for (let i = 0; i < 8; i++) {
      const fin = new THREE.Mesh(finGeo, this.motorMaterial);
      fin.rotation.y = (i * Math.PI) / 8;
      fin.position.set(0, 5.29, 0);
      this.group.add(fin);
    }

    // Top fan cowl / shroud
    const cowlGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 24);
    const cowl = new THREE.Mesh(cowlGeo, this.motorMaterial);
    cowl.position.set(0, 5.79, 0);
    this.group.add(cowl);

    // Lifting eye bolt on top
    const eyeBoltGeo = new THREE.TorusGeometry(0.06, 0.015, 8, 16);
    const eyeBolt = new THREE.Mesh(eyeBoltGeo, this.boltMaterial);
    eyeBolt.position.set(0, 5.95, 0);
    this.group.add(eyeBolt);

    // Terminal electrical box on side
    const junctionBoxGeo = new THREE.BoxGeometry(0.22, 0.22, 0.16);
    const junctionBox = new THREE.Mesh(junctionBoxGeo, this.motorMaterial);
    junctionBox.position.set(0.38, 5.25, 0);
    this.group.add(junctionBox);

    // Rigid shaft seal / stuffing box at bottom of bridge (Y = 4.12)
    const sealGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 16);
    const seal = new THREE.Mesh(sealGeo, this.gearboxMaterial);
    seal.position.set(0, 4.12, 0);
    this.group.add(seal);
  }

  private buildRotatingAssembly() {
    // Agitator vertical shaft: extends from Y = 4.2m down to Y = 0.35m (length = 3.85m)
    const shaftRadius = 0.055; // 110mm diameter heavy shaft
    const shaftHeight = 3.85;
    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftHeight, 24);
    const shaft = new THREE.Mesh(shaftGeo, this.shaftMaterial);
    shaft.position.set(0, 2.275, 0);
    shaft.castShadow = true;
    this.rotatingShaftGroup.add(shaft);

    // Flange coupling at top (Y = 4.05)
    const couplingGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 16);
    const coupling = new THREE.Mesh(couplingGeo, this.shaftMaterial);
    coupling.position.set(0, 4.05, 0);
    this.rotatingShaftGroup.add(coupling);

    // Coupling bolts
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const boltGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8);
      const bolt = new THREE.Mesh(boltGeo, this.boltMaterial);
      bolt.position.set(Math.cos(angle) * 0.14, 4.12, Math.sin(angle) * 0.14);
      this.rotatingShaftGroup.add(bolt);
    }

    // ==========================================
    // 1. LOWER IMPELLER: 4-Blade Pitched Axial Turbine (PBT-45°)
    // Designed specifically for solids suspension from tank bottom!
    // Located at Y = 0.55m (just above bottom floor to sweep sludge)
    // Diameter = 1.65m
    // ==========================================
    const lowerHubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.22, 16);
    const lowerHub = new THREE.Mesh(lowerHubGeo, this.shaftMaterial);
    lowerHub.position.set(0, 0.55, 0);
    this.rotatingShaftGroup.add(lowerHub);

    const bladeLength = 0.68;
    const bladeWidth = 0.26;
    const bladeThickness = 0.02;

    // 4 Pitched Blades at 45 degrees
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const bladeGeo = new THREE.BoxGeometry(bladeLength, bladeThickness, bladeWidth);
      const blade = new THREE.Mesh(bladeGeo, this.impellerMaterial);
      blade.castShadow = true;

      // Group to rotate blade into position and pitch
      const bladeHolder = new THREE.Group();
      bladeHolder.position.set(0, 0.55, 0);
      bladeHolder.rotation.y = angle;

      // Blade offset from center hub
      blade.position.set(bladeLength / 2 + 0.14, 0, 0);
      // Pitch angle 45 degrees for downward axial pumping thrust
      blade.rotation.x = Math.PI / 4;

      bladeHolder.add(blade);
      this.rotatingShaftGroup.add(bladeHolder);
    }

    // ==========================================
    // 2. MID-LEVEL IMPELLER: 6-Blade Rushton Radial Turbine
    // Located at Y = 2.10m (mid-liquid level)
    // Diameter = 1.40m
    // Provides shear, radial liquid distribution and breaks lumps
    // ==========================================
    const midHubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.18, 16);
    const midHub = new THREE.Mesh(midHubGeo, this.shaftMaterial);
    midHub.position.set(0, 2.1, 0);
    this.rotatingShaftGroup.add(midHub);

    // Center circular mounting disc
    const discGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.02, 24);
    const disc = new THREE.Mesh(discGeo, this.impellerMaterial);
    disc.position.set(0, 2.1, 0);
    this.rotatingShaftGroup.add(disc);

    // 6 Vertical radial flat blades
    const rushtonBladeW = 0.28;
    const rushtonBladeH = 0.22;
    const rushtonBladeT = 0.02;

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const rBladeGeo = new THREE.BoxGeometry(rushtonBladeW, rushtonBladeH, rushtonBladeT);
      const rBlade = new THREE.Mesh(rBladeGeo, this.impellerMaterial);
      rBlade.castShadow = true;

      const rBladeHolder = new THREE.Group();
      rBladeHolder.position.set(0, 2.1, 0);
      rBladeHolder.rotation.y = angle;

      rBlade.position.set(0.48 + rushtonBladeW / 2 - 0.08, 0, 0);
      rBladeHolder.add(rBlade);
      this.rotatingShaftGroup.add(rBladeHolder);
    }
  }

  /**
   * Updates shaft rotation based on current RPM, direction, and delta time
   */
  public update(delta: number, rpm: number, direction: 1 | -1) {
    if (rpm > 0.01) {
      // Angular velocity omega in rad/s = (RPM * 2 * PI) / 60
      const omega = (rpm * 2 * Math.PI) / 60;
      this.rotatingShaftGroup.rotation.y += omega * delta * direction;
    }
  }

  public dispose() {
    this.motorMaterial.dispose();
    this.shaftMaterial.dispose();
    this.impellerMaterial.dispose();
    this.gearboxMaterial.dispose();
    this.boltMaterial.dispose();
  }
}
