import { Model } from '../Model'
import { execute, setEnv } from 'molang'
import {
	ISingleAnimation,
	TBoneModifier,
	TTimestamp,
} from '../Schema/Animation'
import { MathUtils } from 'three'

export class Animation {
	protected startTimeStamp = 0
	protected isRunning = false
	protected env = {
		'query.anim_time': () => this.currentTime,
	}

	constructor(
		protected model: Model,
		protected animationData: ISingleAnimation
	) {}

	parseBoneModifier(transform: TBoneModifier) {
		if (typeof transform === 'string') {
			const res =
				typeof transform === 'string'
					? execute(transform, this.env)
					: transform
			return [res, res, res] as [number, number, number]
		} else if (Array.isArray(transform)) {
			return transform.map((t) =>
				typeof t === 'string' ? execute(t, this.env) : t
			) as [number, number, number]
		} else if (transform !== undefined) {
			const timestamps = Object.entries(transform)
				.map(
					([time, transform]) =>
						[Number(time), transform] as [number, TTimestamp]
				)
				.sort(([a], [b]) => a - b)

			for (let i = timestamps.length - 1; i >= 0; i--) {
				let [time, transform] = timestamps[i]

				if (time > this.currentTime) {
					continue
				} else if (time === this.currentTime) {
					if (Array.isArray(transform)) {
						return transform as [number, number, number]
					} else {
						// TODO
						throw new Error('Format not supported yet')
					}
				} else {
					let [nextTime, nexttransform] = timestamps[
						MathUtils.euclideanModulo(i + 1, timestamps.length)
					]
					let timeDelta = nextTime - time

					if (
						Array.isArray(transform) &&
						Array.isArray(nexttransform)
					) {
						return transform.map(
							(n, i) =>
								n +
								(((<[number, number, number]>nexttransform)[i] -
									n) /
									timeDelta) *
									(this.currentTime - time)
						) as [number, number, number]
					} else {
						// TODO
						throw new Error('Format not supported yet')
					}
				}
			}
			return [0, 0, 0]
		}
	}

	tick() {
		const boneMap = this.model.getBoneMap()

		for (let boneName in this.animationData.bones) {
			const bone = boneMap.get(boneName)
			if (!bone) continue
			const { position, rotation, scale } = this.animationData.bones[
				boneName
			]
			const [positionMod, rotationMod, scaleMod] = [
				position,
				rotation,
				scale,
			].map((mod) => this.parseBoneModifier(mod))

			if (positionMod)
				bone.position.set(
					...(positionMod.map(
						(val, i) =>
							(i === 0 ? -1 : 1) * val +
							bone.userData.defaultPosition[i]
					) as [number, number, number])
				)

			if (rotationMod)
				bone.rotation.set(
					...(rotationMod
						.map(MathUtils.degToRad)
						.map(
							(val, i) =>
								bone.userData.defaultRotation[i] +
								(i === 2 ? val : -val)
						) as [number, number, number])
				)

			if (scaleMod)
				bone.scale.set(...(scaleMod as [number, number, number]))
		}

		if (this.currentTime > this.animationData.animation_length) {
			if (this.animationData.loop) this.startTimeStamp = Date.now()
			else this.pause()
		}
	}

	play() {
		this.isRunning = true
		this.startTimeStamp = Date.now()
	}
	pause() {
		this.isRunning = false
	}

	get currentTime() {
		return (Date.now() - this.startTimeStamp) / 1000
	}
	get shouldTick() {
		return this.isRunning
	}
}