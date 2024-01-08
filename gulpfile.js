const gulp = require('gulp');
const del = require('del');
const yargs = require('yargs');
const swc = require('gulp-swc');
const ignore = require('gulp-ignore');
const { map } = require('event-stream');
const { parse } = require('acorn-loose');
const { simple } = require('acorn-walk');
const { relative, resolve } = require('path');
const argv = yargs.parseSync(process.argv.slice(2));

const MIN_FILE_LENGTH = 14;
const paths = {
	files: {
		typescript: './src/**/*.ts',
		javascript: './src/**/*.js',
		other: './src/**/*.css',
	},
	build: './build'
};
const state = {
	DEV: 'development',
	PRODUCTION: 'production',
	DEFAULT: 'default',
	get current() {
		return argv.state ?? this[this.DEFAULT];
	},
	get prod() {
		return this.current === this.PRODUCTION;
	}
};
const moduleAliases = require('./package.json')._moduleAliases ?? {};

function moduleAlias() {
	return map((file, callback) => {
		const requireAliases = [];
		const filePath = file.path;
		let fileContent = file.contents.toString();

		simple(parse(fileContent, {
			ecmaVersion: 'latest',
			sourceType: 'script'
		}), {
			CallExpression(node) {
				if (!node.callee) return;
				if (node.callee.name === 'require') {
					const [stringArg] = node.arguments;
					const [before, ...afterSlash] = stringArg.value.split('/');
					afterSlash.unshift('');
					const after = afterSlash.join('/');

					if (stringArg.type === 'Literal' && before in moduleAliases) {
						requireAliases.push({
							start: stringArg.start,
							end: stringArg.end,
							alias: before,
							target: moduleAliases[before],
							optionalPath: after
						});
					}
				}
			}
		});

		for (const instance of requireAliases) {
			const resolvedTarget = resolve(__dirname, instance.target);
			const path = (`./${ relative(resolve(__dirname, filePath), resolvedTarget).substring(3) }` + instance.optionalPath).replace(/\\/g, '/');
			const diff = path.length - (instance.alias.length + instance.optionalPath.length);

			fileContent = fileContent.slice(0, instance.start) + fileContent.slice(instance.end);
			fileContent = `${ fileContent.slice(0, instance.start) }"${ path }"${ fileContent.slice(instance.start) }`;

			// Shift all following aliases by the difference in length.
			for (const inst of requireAliases) {
				inst.start += diff;
				inst.end += diff;
			}
		}

		file.contents = Buffer.from(fileContent);

		callback(null, file);
	});
}

const typescript = () => {
	return gulp.src(paths.files.typescript)
		.pipe(swc({
			minify: state.prod,
			jsc: {
				parser: {
					syntax: 'typescript',
					tsx: false,
					decorators: true,
					dynamicImport: true
				},
				target: 'es2022',
				...state.prod
					? {
						minify: {
							mangle: true,
							compress: { unused: true }
						}
					}
					: {}
			},
			module: {
				type: 'commonjs',
				strict: true,
				strictMode: true,
				lazy: false,
				noInterop: true
			}
		}))
		.pipe(ignore.exclude(file => file.contents.length <= MIN_FILE_LENGTH))
		.pipe(moduleAlias())
		.pipe(gulp.dest(paths.build));
}
const javascript = () => {
	return gulp.src(paths.files.javascript)
		.pipe(swc({
			minify: state.prod,
			jsc: {
				parser: {
					syntax: 'ecmascript',
					decorators: true,
					dynamicImport: true
				},
				target: 'es2022',
				...state.prod
					? {
						minify: {
							mangle: true,
							compress: { unused: true }
						}
					}
					: {}
			},
			module: {
				type: 'commonjs',
				strict: true,
				strictMode: true,
				lazy: false,
				noInterop: true
			}
		}))
		.pipe(ignore.exclude(file => file.contents.length <= MIN_FILE_LENGTH))
		.pipe(moduleAlias())
		.pipe(gulp.dest(paths.build));
}

const other = () => {
	return gulp.src(paths.files.other)
		.pipe(gulp.dest(paths.build));
}

const clean = () => {
	return del(['./build'], { force: true });
}

const cleanAll = () => {
	return del(['./build', './dist'], { force: true });
}

module.exports.clean = clean;
module.exports.default = module.exports.build = gulp.series(state.prod ? cleanAll : clean, gulp.parallel(typescript, javascript, other));
