import { ObjectStorageService, objectStorageClient } from "../object_storage";
import { randomUUID } from "crypto";

const SPRITES_DIR = "sprites";
const MAPS_DIR = "maps";
const TILESETS_DIR = "tilesets";

export class GameAssetStorageService {
  private objectStorage: ObjectStorageService;
  private bucketName: string;

  constructor() {
    this.objectStorage = new ObjectStorageService();
    this.bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || "";
  }

  private getPublicDir(): string {
    const paths = this.objectStorage.getPublicObjectSearchPaths();
    return paths[0] || "";
  }

  async uploadSprite(imageBuffer: Buffer, characterName: string): Promise<string> {
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

  async uploadMapData(jsonData: string, locationName: string): Promise<string> {
    const publicDir = this.getPublicDir();
    const fileName = `${locationName.toLowerCase().replace(/\s+/g, "_")}_${randomUUID().slice(0, 8)}.json`;
    const objectPath = `${publicDir}/${MAPS_DIR}/${fileName}`;
    
    const { bucketName, objectName } = this.parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(jsonData, {
      contentType: "application/json",
      metadata: {
        "custom:aclPolicy": JSON.stringify({
          owner: "system",
          visibility: "public",
        }),
      },
    });
    
    return `/objects/${MAPS_DIR}/${fileName}`;
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
