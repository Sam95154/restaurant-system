import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDirectory = path.join(
  process.cwd(),
  'uploads',
  'menu',
);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const safeName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}${extension}`;

    cb(null, safeName);
  },
});

const fileFilter: multer.Options['fileFilter'] = (
  _req,
  file,
  cb,
) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    cb(
      new Error(
        'Only JPG, JPEG, PNG, and WEBP images are allowed.',
      ),
    );
    return;
  }

  cb(null, true);
};

export const menuImageUpload = multer({
  storage,

  fileFilter,

  limits: {
    /*
     * Maximum individual image size: 5 MB
     */
    fileSize: 5 * 1024 * 1024,

    /*
     * Maximum number of files accepted by one request.
     */
    files: 10,
  },
});