import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, NotFound } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { nanoid } from 'nanoid'
import { parseHTMLRefNodeAtBeginning } from './utils'

const OBJECT_KEY_PREFIX = 'cf-paste-bin/'
const PUT_OBJECT_EXPIRES_IN = 3600
const GET_OBJECT_EXPIRES_IN = 6 * 3600

const INLINE_ALLOWED_CONTENT_TYPES = [/^image\//, /^video\//, /^audio\//, /^application\/pdf$/]

/** @type {Record<string, import("./routes").PasteBinItemTypeHandler>} */
export const fileTypeHandlers = {
  f: async (data, env) => {
    const parsedAttrs = parseHTMLRefNodeAtBeginning(data.content)
    if (!parsedAttrs || !parsedAttrs.fileKey || !parsedAttrs.filename) return

    const objectKey = parsedAttrs.fileKey
    const filename = parsedAttrs.filename

    const s3 = getS3Client(env)
    let objMeta
    try {
      objMeta = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }))
    } catch (e) {
      const isNotFound = e instanceof NotFound
      if (!isNotFound) console.error(`Error head object: ${data.key}(${objectKey})`, e)
      return { status: isNotFound ? 404 : 500 }
    }

    let contentDispositionType = 'attachment'
    if (objMeta.ContentType && INLINE_ALLOWED_CONTENT_TYPES.some((re) => re.test(objMeta.ContentType))) {
      contentDispositionType = 'inline'
    }
    let contentDispositionFilenamePart = ''
    if (filename) contentDispositionFilenamePart = `; filename*=utf-8''${encodeURIComponent(filename)}`

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        ResponseContentDisposition: `${contentDispositionType}${contentDispositionFilenamePart}`,
      }),
      { expiresIn: GET_OBJECT_EXPIRES_IN }
    )

    return { status: 302, headers: { location: url } }
  },
}

/**
 * @type {import("./routes").Route[]}
 */
export const fileRoutes = [
  {
    method: 'POST',
    pathMatcher: /^\/file$/,
    handler: async function generatePresignedUploadURL({ env }) {
      const s3 = getS3Client(env)

      const objectKey = generateObjectKey()

      const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }), {
        expiresIn: PUT_OBJECT_EXPIRES_IN,
      })

      return { body: { url: uploadUrl, key: objectKey } }
    },
  },
]

function generateObjectKey() {
  return `${OBJECT_KEY_PREFIX}${nanoid()}`
}

/**
 * @argument {import('./routes').RouteHandlerEnv} env
 */
function getS3Client(env) {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  })
}
