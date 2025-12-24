import { ObjectStorageService, objectStorageClient } from "../object_storage";
import { randomUUID } from "crypto";

const SPRITES_DIR = "sprites";
const TILESETS_DIR = "tilesets";
const ENV_SPRITES_DIR = "env_sprites";
const BACKGROUNDS_DIR = "backgrounds";
const PORTRAITS_DIR = "portraits";
const SPELL_ANIMATIONS_DIR = "spell_animations";

export class GameAssetStorageService {
  private objectStorage: ObjectStorageService;
  private bucketName: string;

  constructor() {
    this.objectStorage = new ObjectStorageService();
    this.bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || "";
  }

  private getPublicDir(): string {
    const paths = this.objectStorage.getPublicObjectSearchPaths();
    if (!paths || paths.length === 0 || !paths[0]) {
      console.warn("No public object storage path configured, using bucket root");
      return this.bucketName;
    }
    return paths[0];
  }

  private isConfigured(): boolean {
    return !!this.bucketName;
  }

  async uploadSprite(imageBuffer: Buffer, characterName: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Object storage not configured");
    }

    const publicDir = this.getPublicDir();
    const fileName = `${characterName.toLowerCase().replace(/\s+/g, "_")}_${randomUUID().slice(0, 8)}.png`;
    const objectPath = `${publicDir}/${SPRITES_DIR}/${fileName}`;
    
    const { bucketName, objectName } = this.parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(imageBuffer, {
      contentType: "image/png",
      metadata: {
        "custom:aclPolicy": JSON.stringify({
          owner: "system",
          visibility: "public",
        }),
      },
    });
    
    return `/objects/${SPRITES_DIR}/${fileName}`;
  }

  async uploadTileset(imageBuffer: Buffer, locationName: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Object storage not configured");
    }

    const publicDir = this.getPublicDir();
    const fileName = `${locationName.toLowerCase().replace(/\s+/g, "_")}_${randomUUID().slice(0, 8)}.png`;
    const objectPath = `${publicDir}/${TILESETS_DIR}/${fileName}`;
    
    const { bucketName, objectName } = this.parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(imageBuffer, {
      contentType: "image/png",
      metadata: {
        "custom:aclPolicy": JSON.stringify({
          owner: "system",
          visibility: "public",
        }),
      },
    });
    
    return `/objects/${TILESETS_DIR}/${fileName}`;
  }

  async uploadEnvironmentSprite(imageBuffer: Buffer, assetId: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Object storage not configured");
    }

    const publicDir = this.getPublicDir();
    const fileName = `${assetId.toLowerCase().replace(/\s+/g, "_")}_${randomUUID().slice(0, 8)}.png`;
    const objectPath = `${publicDir}/${ENV_SPRITES_DIR}/${fileName}`;
    
    const { bucketName, objectName } = this.parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(imageBuffer, {
      contentType: "image/png",
      metadata: {
        "custom:aclPolicy": JSON.stringify({
          owner: "system",
          visibility: "public",
        }),
      },
    });
    
    return `/objects/${ENV_SPRITES_DIR}/${fileName}`;
  }

  async uploadBackground(imageBuffer: Buffer, locationName: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Object storage not configured");
    }

    const publicDir = this.getPublicDir();
    const fileName = `${locationName.toLowerCase().replace(/\s+/g, "_")}_${randomUUID().slice(0, 8)}.png`;
    const objectPath = `${publicDir}/${BACKGROUNDS_DIR}/${fileName}`;
    
    const { bucketName, objectName } = this.parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(imageBuffer, {
      contentType: "image/png",
      metadata: {
        "custom:aclPolicy": JSON.stringify({
          owner: "system",
          visibility: "public",
        }),
      },
    });
    
    return `/objects/${BACKGROUNDS_DIR}/${fileName}`;
  }

  async uploadPortrait(imageBuffer: Buffer, characterName: string, expression: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Object storage not configured");
    }

    const publicDir = this.getPublicDir();
    const fileName = `${characterName.toLowerCase().replace(/\s+/g, "_")}_${expression}_${randomUUID().slice(0, 8)}.png`;
    const objectPath = `${publicDir}/${PORTRAITS_DIR}/${fileName}`;
    
    const { bucketName, objectName } = this.parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(imageBuffer, {
      contentType: "image/png",
      metadata: {
        "custom:aclPolicy": JSON.stringify({
          owner: "system",
          visibility: "public",
        }),
      },
    });
    
    return `/objects/${PORTRAITS_DIR}/${fileName}`;
  }

  async uploadSpellAnimation(spellName: string, imageBuffer: Buffer): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Object storage not configured");
    }

    const publicDir = this.getPublicDir();
    const fileName = `${spellName.toLowerCase().replace(/\s+/g, "_")}_${randomUUID().slice(0, 8)}.png`;
    const objectPath = `${publicDir}/${SPELL_ANIMATIONS_DIR}/${fileName}`;
    
    const { bucketName, objectName } = this.parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(imageBuffer, {
      contentType: "image/png",
      metadata: {
        "custom:aclPolicy": JSON.stringify({
          owner: "system",
          visibility: "public",
        }),
      },
    });
    
    return `/objects/${SPELL_ANIMATIONS_DIR}/${fileName}`;
  }

  private parseObjectPath(path: string): { bucketName: string; objectName: string } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }

    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join("/");

    return { bucketName, objectName };
  }
}

export const assetStorage = new GameAssetStorageService();
